/**
 * Process many tracked emails in one go, as a background job.
 *
 * Each email costs ~25 s (OpenAI extraction dominates), so twenty of them is
 * eight minutes — far longer than a browser should hold a request open, and a
 * proxy or laptop sleep would kill it half-way. So the work runs here, the
 * request returns a job id at once, and the page polls for progress.
 *
 * Deliberately sequential. Parallel runs would multiply OpenAI and Gmail rate
 * pressure for little gain, and make "which email broke it" harder to answer.
 * One batch at a time, for the same reasons and so two batches cannot race to
 * process the same message.
 *
 * Job state is in memory. A restart forgets the job, but not the work: every
 * processed email is labelled in Gmail and recorded in the database, so running
 * the batch again simply skips what is already done.
 */

import crypto from 'node:crypto';
import { processTrackedEmail } from './email';
import { serverLog } from '../lib/serverLog';

/** Upper bound for one "process everything" run — a runaway label cannot queue thousands. */
export const BATCH_CAP = Number(process.env.EMAIL_BATCH_CAP || 100);

type ItemResult = {
  messageId: string;
  ok: boolean;
  status?: string;
  lots?: string[];
  error?: string;
  ms: number;
};

export type BatchJob = {
  id: string;
  total: number;
  done: number;
  failed: number;
  currentMessageId: string | null;
  startedAt: string;
  finishedAt: string | null;
  results: ItemResult[];
  cancelled: boolean;
};

const jobs = new Map<string, BatchJob>();
let runningJobId: string | null = null;

export function currentJob(): BatchJob | null {
  return runningJobId ? jobs.get(runningJobId) ?? null : null;
}

export function getJob(id: string): BatchJob | null {
  return jobs.get(id) ?? null;
}

export function cancelJob(id: string): boolean {
  const job = jobs.get(id);
  if (!job || job.finishedAt) return false;
  job.cancelled = true;
  return true;
}

export function startBatch(messageIds: string[]): BatchJob {
  if (runningJobId) {
    const running = jobs.get(runningJobId);
    if (running && !running.finishedAt) {
      throw new Error('A batch is already running. Wait for it to finish, or cancel it.');
    }
  }

  const unique = [...new Set(messageIds)].slice(0, BATCH_CAP);
  const job: BatchJob = {
    id: crypto.randomUUID(),
    total: unique.length,
    done: 0,
    failed: 0,
    currentMessageId: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    results: [],
    cancelled: false,
  };
  jobs.set(job.id, job);
  runningJobId = job.id;

  // Not awaited: the HTTP request returns the job id immediately.
  void (async () => {
    serverLog('[BATCH] %s starting — %d email(s)', job.id, job.total);
    for (const messageId of unique) {
      if (job.cancelled) break;
      job.currentMessageId = messageId;
      const t0 = Date.now();
      try {
        const result: any = await processTrackedEmail(messageId, { requestId: `batch-${job.id.slice(0, 8)}` });
        const reports: any[] = Array.isArray(result?.analysis) ? result.analysis : [];
        job.results.push({
          messageId,
          ok: true,
          status: result?.status,
          lots: reports.map((r) => r?.lotNumber).filter(Boolean),
          ms: Date.now() - t0,
        });
      } catch (e: any) {
        // One bad email must not stop the rest.
        job.failed++;
        job.results.push({ messageId, ok: false, error: e?.message ?? String(e), ms: Date.now() - t0 });
        serverLog('[BATCH] %s failed on %s: %s', job.id, messageId, e?.message);
      }
      job.done++;
    }
    job.currentMessageId = null;
    job.finishedAt = new Date().toISOString();
    if (runningJobId === job.id) runningJobId = null;
    serverLog('[BATCH] %s finished — %d ok, %d failed%s',
      job.id, job.done - job.failed, job.failed, job.cancelled ? ' (cancelled)' : '');

    // Keep a little history for the page, not an unbounded map.
    const finished = [...jobs.values()].filter((j) => j.finishedAt);
    for (const old of finished.slice(0, Math.max(0, finished.length - 10))) jobs.delete(old.id);
  })();

  return job;
}
