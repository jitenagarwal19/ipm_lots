"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getApiBaseUrl } from "@/lib/utils";

/**
 * Process many tracked emails at once.
 *
 * Runs as a server-side job that this panel polls, because each email takes
 * ~25 s and twenty of them is far longer than a browser should hold a request
 * open. Closing the tab does not stop the job, and reloading the page
 * reattaches to it.
 */

const API = `${getApiBaseUrl()}/emails`;
const POLL_MS = 2000;

type ItemResult = { messageId: string; ok: boolean; status?: string; lots?: string[]; error?: string; ms: number };
type Job = {
  id: string;
  total: number;
  done: number;
  failed: number;
  currentMessageId: string | null;
  finishedAt: string | null;
  cancelled: boolean;
  results: ItemResult[];
};

export function BatchProcessPanel({
  selectedIds,
  subjectFor,
  onFinished,
  onRunningChange,
}: {
  selectedIds: string[];
  subjectFor: (messageId: string) => string | undefined;
  onFinished: () => void;
  onRunningChange: (running: boolean) => void;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [unprocessed, setUnprocessed] = useState<{ count: number; capped: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const finishedRef = useRef<string | null>(null);

  const running = Boolean(job && !job.finishedAt);

  useEffect(() => onRunningChange(running), [running, onRunningChange]);

  const refreshCount = useCallback(async () => {
    try {
      const r = await fetch(`${API}/unprocessed`);
      if (r.ok) setUnprocessed(await r.json());
    } catch {
      /* the count is a convenience; the button still works without it */
    }
  }, []);

  // On load: reattach to a batch that is already running.
  useEffect(() => {
    void refreshCount();
    fetch(`${API}/batch/current`)
      .then((r) => r.json())
      .then((d) => d.job && setJob(d.job))
      .catch(() => undefined);
  }, [refreshCount]);

  // Poll while a job runs.
  useEffect(() => {
    if (!job || job.finishedAt) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`${API}/batch/${job.id}`);
        const d = await r.json();
        if (d.job) setJob(d.job);
      } catch {
        /* transient — try again next tick */
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [job]);

  // When a job finishes, refresh the inbox once.
  useEffect(() => {
    if (job?.finishedAt && finishedRef.current !== job.id) {
      finishedRef.current = job.id;
      onFinished();
      void refreshCount();
    }
  }, [job, onFinished, refreshCount]);

  const start = async (messageIds?: string[]) => {
    setStarting(true);
    setError(null);
    try {
      const r = await fetch(`${API}/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messageIds ? { messageIds } : {}),
      });
      const d = await r.json();
      if (d.job) setJob(d.job);
      if (!r.ok) setError(d.error || "Could not start the batch.");
      else if (!d.job) setError(d.message || "Nothing to process.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the batch.");
    } finally {
      setStarting(false);
    }
  };

  const cancel = async () => {
    if (!job) return;
    await fetch(`${API}/batch/${job.id}/cancel`, { method: "POST" }).catch(() => undefined);
  };

  const pct = job && job.total ? Math.round((job.done / job.total) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => start()}
          disabled={running || starting || unprocessed?.count === 0}
          className="bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {starting && !selectedIds.length ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Fetch & process all unprocessed
          {unprocessed ? ` (${unprocessed.count}${unprocessed.capped ? "+" : ""})` : ""}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => start(selectedIds)}
          disabled={running || starting || selectedIds.length === 0}
          className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
        >
          Process selected ({selectedIds.length})
        </Button>
        {running && (
          <Button type="button" variant="ghost" onClick={cancel} disabled={job?.cancelled} className="text-zinc-400">
            {job?.cancelled ? "Stopping after this email…" : "Stop"}
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-amber-400">{error}</p>}

      {job && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-200">
              {job.finishedAt
                ? job.cancelled
                  ? `Stopped — ${job.done} of ${job.total} processed`
                  : `Done — ${job.done - job.failed} processed${job.failed ? `, ${job.failed} failed` : ""}`
                : `Processing ${job.done + 1} of ${job.total}…`}
            </span>
            <span className="tabular-nums text-zinc-500">{pct}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-full transition-all ${job.failed ? "bg-amber-500" : "bg-emerald-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {job.currentMessageId && (
            <p className="mt-2 truncate text-xs text-zinc-500">
              Now: {subjectFor(job.currentMessageId) ?? job.currentMessageId}
            </p>
          )}
          {job.results.length > 0 && (
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
              {[...job.results].reverse().map((r) => (
                <li key={r.messageId} className="flex items-start gap-2">
                  <span className={r.ok ? "text-emerald-400" : "text-red-400"}>{r.ok ? "✓" : "✕"}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-400" title={subjectFor(r.messageId)}>
                    {subjectFor(r.messageId) ?? r.messageId}
                  </span>
                  <span className="shrink-0 text-zinc-500">
                    {r.ok ? (r.lots?.length ? r.lots.join(", ") : r.status) : r.error}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
