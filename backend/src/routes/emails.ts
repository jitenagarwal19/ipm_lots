import { Router } from 'express';
import { listUnprocessedTrackedIds } from '../services/email';
import { startBatch, getJob, currentJob, cancelJob, BATCH_CAP } from '../services/emailBatch';
import { PrismaClient } from '@prisma/client';
import { serverLog } from '../lib/serverLog';

const router = Router();
const prisma = new PrismaClient();
import { getTrackedEmailsFromGmail, processTrackedEmail } from '../services/email';

// Process a tracked email
router.post('/process/:messageId', async (req, res) => {
  const messageId = req.params.messageId;
  const startedAt = Date.now();
  const rid = req.requestId;
  serverLog(`[API][${rid}] POST /emails/process/${messageId} handler entered`);
  try {
    const result = await processTrackedEmail(messageId, { requestId: rid });
    serverLog(
      `[API][${rid}] POST /emails/process/${messageId} ok in ${Date.now() - startedAt}ms status=${result.status} reports=${Array.isArray(result.analysis) ? result.analysis.length : 0}`
    );
    res.json({ requestId: rid, ...result });
  } catch (error: any) {
    serverLog(
      `[API][${rid}] POST /emails/process/${messageId} failed after ${Date.now() - startedAt}ms: %s`,
      error?.message || error
    );
    res.status(500).json({ requestId: rid, error: error.message });
  }
});

// Get tracked emails from Gmail
async function trackedLabels(): Promise<string[]> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: 'tracked_email_labels' } });
  return (setting?.value ?? '').split(',').map((l: string) => l.trim()).filter(Boolean);
}

/** How many unprocessed tracked emails exist — for the button label. */
router.get('/unprocessed', async (_req, res) => {
  try {
    const ids = await listUnprocessedTrackedIds(await trackedLabels(), BATCH_CAP);
    res.json({ count: ids.length, cap: BATCH_CAP, capped: ids.length >= BATCH_CAP });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Start a batch. Body { messageIds?: string[] } — omit it to process every
 * unprocessed tracked email. Returns immediately with a job id to poll.
 */
router.post('/batch', async (req, res) => {
  try {
    const requested: unknown = req.body?.messageIds;
    const ids = Array.isArray(requested) && requested.length > 0
      ? requested.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : await listUnprocessedTrackedIds(await trackedLabels(), BATCH_CAP);

    if (ids.length === 0) return res.json({ job: null, message: 'Nothing to process — every tracked email is already done.' });
    const job = startBatch(ids);
    res.status(202).json({ job });
  } catch (error: any) {
    const busy = /already running/i.test(error.message);
    res.status(busy ? 409 : 500).json({ error: error.message, job: busy ? currentJob() : undefined });
  }
});

/** The running batch, if any — lets a reloaded page reattach to it. */
router.get('/batch/current', (_req, res) => {
  res.json({ job: currentJob() });
});

router.get('/batch/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'No such batch (the server may have restarted).' });
  res.json({ job });
});

router.post('/batch/:id/cancel', (req, res) => {
  // Stops after the email in flight — one cannot be interrupted half-way
  // without leaving a report half-saved.
  res.json({ ok: cancelJob(req.params.id) });
});

router.get('/tracked', async (req, res) => {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'tracked_email_labels' }
    });

    if (!setting || !setting.value) {
      return res.json([]);
    }

    // Split by comma and trim spaces
    const labels = setting.value.split(',').map((l: string) => l.trim()).filter(Boolean);
    
    if (labels.length === 0) {
      return res.json([]);
    }

    const emails = await getTrackedEmailsFromGmail(labels);
    res.json(emails);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all email logs
router.get('/', async (req, res) => {
  try {
    const emails = await prisma.email.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        attachments: true,
        test: {
          include: {
            lot: true,
            lab: true
          }
        }
      }
    });
    res.json(emails);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
