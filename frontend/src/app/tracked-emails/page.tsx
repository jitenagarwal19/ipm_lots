"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getApiBaseUrl, getBackendBaseUrl } from "@/lib/utils";

type TrackedEmail = {
  id: string;
  date?: string;
  from?: string;
  subject?: string;
  snippet?: string;
  attachments?: { filename: string }[];
  isProcessed?: boolean;
};

type LabReportAnalysis = {
  lotNumber?: string | null;
};

type ProcessingTimings = Record<string, number | undefined>;

const processingStages = [
  { maxElapsedMs: 2000, label: "Fetching Gmail message", progress: 18 },
  { maxElapsedMs: 6000, label: "Downloading attachments", progress: 38 },
  { maxElapsedMs: 12000, label: "Reading PDF text", progress: 55 },
  { maxElapsedMs: 25000, label: "Extracting with OpenAI", progress: 78 },
  {
    maxElapsedMs: Number.POSITIVE_INFINITY,
    label: "OpenAI still running or saving to DB (see backend terminal for [PROCESS] logs)",
    progress: 92,
  },
];

function getProcessingStage(startedAt: number, tick: number) {
  const elapsedMs = tick - startedAt;
  return processingStages.find(stage => elapsedMs < stage.maxElapsedMs) || processingStages[processingStages.length - 1];
}

export default function TrackedEmailsPage() {
  const [emails, setEmails] = useState<TrackedEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [processingStartedAt, setProcessingStartedAt] = useState<Record<string, number>>({});
  const [progressTick, setProgressTick] = useState(0);

  const handleProcess = async (messageId: string) => {
    setProcessingIds(prev => new Set(prev).add(messageId));
    // Progress is driven by elapsed wall-clock time while the long request is in flight.
    // eslint-disable-next-line react-hooks/purity
    const startedAt = Date.now();
    setProgressTick(startedAt);
    setProcessingStartedAt(prev => ({ ...prev, [messageId]: startedAt }));
    try {
      const apiBase = getApiBaseUrl();
      const url = `${apiBase}/emails/process/${messageId}`;
      const requestId = crypto.randomUUID();
      if (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
        console.info(
          "[tracked-emails] page host is",
          window.location.host,
          "→ API base is",
          apiBase,
          "(set NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:4000 if requests never reach the backend)"
        );
      }
      console.info("[tracked-emails] POST start", { requestId, url, backend: getBackendBaseUrl() });

      const controller = new AbortController();
      const timeoutMs = 600_000; // 10 min — OpenAI + huge PDFs can be slow
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "X-Request-Id": requestId,
        },
      });
      window.clearTimeout(timeoutId);
      const data = await res.json();
      console.info("[tracked-emails] POST done", {
        requestId: res.headers.get("X-Request-Id") || requestId,
        messageId,
        ok: res.ok,
        ms: Date.now() - startedAt,
        status: data?.status,
      });
      if (!res.ok) {
        alert("Error: " + (data.error || "Failed to process"));
      } else {
        const reports: LabReportAnalysis[] = Array.isArray(data.analysis) ? data.analysis : [];
        const timings: ProcessingTimings = data.timings || {};
        const lotNumbers = reports
          .map(report => report.lotNumber)
          .filter(Boolean)
          .join(', ');
        const timingLines = [
          `Total: ${timings.totalMs ?? '-'} ms`,
          `OpenAI: ${timings.openAiMs ?? '-'} ms`,
          `Attachments/PDF: ${timings.attachmentProcessingMs ?? '-'} ms`,
          `Gmail fetch: ${timings.gmailMessageFetchMs ?? '-'} ms`,
          `Gmail label: ${timings.processedLabelMs ?? '-'} ms`,
          `DB save: ${(timings.emailSaveMs || 0) + (timings.reportSaveMs || 0)} ms`,
        ].join('\n');
        const labelStatus = data.processedLabelApplied
          ? 'Gmail label: processed'
          : data.processedLabelError ? `Gmail label warning: ${data.processedLabelError}` : '';
        alert(`Status: ${data.status}\nReports extracted: ${reports.length}\nExtracted Lots: ${lotNumbers || 'None'}${labelStatus ? `\n${labelStatus}` : ''}\n\nTiming:\n${timingLines}`);
        setEmails(prev => prev.map(e => e.id === messageId ? { ...e, isProcessed: true } : e));
      }
    } catch (err) {
      console.error("[tracked-emails] POST failed", messageId, err);
      const msg =
        err instanceof DOMException && err.name === "AbortError"
          ? "Request timed out (10 min). Check backend terminal for [HTTP] and [PROCESS] logs — or set NEXT_PUBLIC_BACKEND_URL if the API host is wrong."
          : err instanceof Error
            ? err.message
            : "Network error while processing.";
      alert(msg);
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
      setProcessingStartedAt(prev => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
    }
  };

  const loadTrackedEmails = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${getApiBaseUrl()}/emails/tracked`, {
        signal: controller.signal,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch tracked emails.");
      }

      setEmails(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to fetch tracked emails:", err);
      setError(err instanceof DOMException && err.name === "AbortError"
        ? "Gmail is taking too long to respond. Try again in a moment."
        : err instanceof Error ? err.message : "Failed to fetch tracked emails."
      );
      setEmails([]);
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetching initial API state on mount is intentional for this page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTrackedEmails();
  }, [loadTrackedEmails]);

  useEffect(() => {
    if (processingIds.size === 0) return;

    const intervalId = window.setInterval(() => {
      setProgressTick(Date.now());
    }, 500);

    return () => window.clearInterval(intervalId);
  }, [processingIds.size]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-white">Tracked Inbox</h2>
        <p className="text-zinc-400 mt-2">Live feed of emails matching your configured labels from Gmail.</p>
      </div>

      <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-zinc-100">Live Gmail Feed</CardTitle>
          <CardDescription className="text-zinc-400">Emails matching the tracked labels specified in your Settings.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-zinc-800">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400 w-[150px]">Date</TableHead>
                  <TableHead className="text-zinc-400 w-[200px]">From</TableHead>
                  <TableHead className="text-zinc-400">Subject</TableHead>
                  <TableHead className="text-zinc-400">Snippet</TableHead>
                  <TableHead className="text-zinc-400 w-[150px]">Attachments</TableHead>
                  <TableHead className="text-zinc-400 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-zinc-500 py-8">Fetching recent Gmail messages...</TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-zinc-500 py-8">
                      <div className="flex flex-col items-center gap-3">
                        <span>{error}</span>
                        <button
                          onClick={loadTrackedEmails}
                          className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs rounded-md border border-zinc-700 transition-colors"
                        >
                          Retry
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : emails.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-zinc-500 py-8">No emails found matching your tracked labels.</TableCell>
                  </TableRow>
                ) : (
                  emails.map((email) => (
                    <TableRow key={email.id} className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                      <TableCell className="text-zinc-300 font-medium whitespace-nowrap text-sm">
                        {email.date ? format(new Date(email.date), "MMM d, HH:mm") : '-'}
                      </TableCell>
                      <TableCell className="text-zinc-300 text-sm truncate max-w-[200px]" title={email.from}>{email.from}</TableCell>
                      <TableCell className="text-zinc-100 font-medium">{email.subject}</TableCell>
                      <TableCell className="text-zinc-400 text-sm truncate max-w-[300px]" title={email.snippet}>{email.snippet}</TableCell>
                      <TableCell className="text-zinc-300 text-xs">
                        {email.attachments && email.attachments.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {email.attachments.map((att, i) => (
                              <span key={i} className="bg-zinc-800 text-zinc-300 px-2 py-1 rounded truncate max-w-[130px]" title={att.filename}>
                                📎 {att.filename}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-zinc-600 italic">None</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {email.isProcessed ? (
                          <span className="px-3 py-1 bg-zinc-800 text-zinc-400 text-xs rounded-md border border-zinc-700 cursor-not-allowed">
                            Processed
                          </span>
                        ) : processingIds.has(email.id) ? (
                          <div className="ml-auto w-[190px] space-y-2 text-left">
                            <button 
                              disabled
                              className="w-full px-3 py-1 bg-emerald-600 text-white text-xs rounded-md opacity-80 cursor-wait"
                            >
                              Processing...
                            </button>
                            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                              <div
                                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                                style={{
                                  width: `${getProcessingStage(processingStartedAt[email.id] || progressTick, progressTick).progress}%`,
                                }}
                              />
                            </div>
                            <p className="text-[11px] leading-tight text-zinc-400">
                              {getProcessingStage(processingStartedAt[email.id] || progressTick, progressTick).label}
                              <span className="block text-zinc-500 mt-0.5">
                                Elapsed {Math.floor((progressTick - (processingStartedAt[email.id] || progressTick)) / 1000)}s — progress bar is approximate
                              </span>
                            </p>
                          </div>
                        ) : (
                          <button 
                            onClick={() => handleProcess(email.id)}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-md disabled:opacity-50 transition-colors"
                          >
                            Process
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
