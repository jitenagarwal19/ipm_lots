"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { getApiBaseUrl } from "@/lib/utils";

type LotMatch = {
  lot_number?: string | null;
  product?: { name?: string | null } | null;
  variant?: { name?: string | null } | null;
  company?: { name?: string | null } | null;
};

type UnmappedReport = {
  id: string;
  lot_number?: string | null;
  source_attachment_filename?: string | null;
  source_type?: string | null;
  createdAt: string;
  email?: {
    id?: string;
    subject?: string | null;
    from_email?: string | null;
    received_at?: string | null;
  } | null;
  attachment?: {
    original_filename?: string | null;
  } | null;
  metadata?: {
    sampleName?: string | null;
    sampleType?: string | null;
    clientName?: string | null;
    labName?: string | null;
  } | null;
  lotMatch?: LotMatch | null;
  moleculeResults?: unknown[];
};

type CandidateTest = {
  id: string;
  status: string;
  lot?: { lot_number?: string | null } | null;
  lab?: { name?: string | null } | null;
  test_type?: { name?: string | null } | null;
};

const ELIGIBLE_TEST_STATUSES = new Set(["AWAITING_REPORT", "INITIATED"]);

function describeTest(test: CandidateTest) {
  const lot = test.lot?.lot_number || "(no lot)";
  const labName = test.lab?.name || "Unknown lab";
  const typeName = test.test_type?.name || "Unknown test";
  return `${lot} — ${typeName} (${labName})`;
}

export default function MappingPage() {
  const [reports, setReports] = useState<UnmappedReport[]>([]);
  const [tests, setTests] = useState<CandidateTest[]>([]);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [reportsRes, testsRes] = await Promise.all([
        fetch(`${getApiBaseUrl()}/reviews?status=UNMAPPED`),
        fetch(`${getApiBaseUrl()}/tests`),
      ]);

      if (!reportsRes.ok) {
        throw new Error((await reportsRes.json())?.error || "Failed to load unmapped reports.");
      }
      if (!testsRes.ok) {
        throw new Error((await testsRes.json())?.error || "Failed to load tests.");
      }

      const reportsData: UnmappedReport[] = await reportsRes.json();
      const testsData: CandidateTest[] = await testsRes.json();

      setReports(Array.isArray(reportsData) ? reportsData : []);
      setTests(Array.isArray(testsData) ? testsData : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load mapping data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const eligibleTests = useMemo(
    () => tests.filter(t => ELIGIBLE_TEST_STATUSES.has(t.status)),
    [tests]
  );

  /**
   * For a given unmapped report, return the eligible Tests with any
   * lot-number match floated to the top so the user sees the suggested
   * pairing first.
   */
  const candidatesForReport = useCallback(
    (report: UnmappedReport) => {
      const lot = (report.lot_number || "").trim().toLowerCase();
      if (!lot) return eligibleTests;
      return [...eligibleTests].sort((a, b) => {
        const aMatch = (a.lot?.lot_number || "").trim().toLowerCase() === lot ? 0 : 1;
        const bMatch = (b.lot?.lot_number || "").trim().toLowerCase() === lot ? 0 : 1;
        return aMatch - bMatch;
      });
    },
    [eligibleTests]
  );

  const handleMap = async (reportId: string) => {
    const testId = selection[reportId];
    if (!testId) {
      setError("Pick a test first.");
      return;
    }

    setPending(prev => ({ ...prev, [reportId]: true }));
    setError(null);
    setFeedback(null);

    try {
      const res = await fetch(`${getApiBaseUrl()}/reviews/${reportId}/map-to-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testId }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Failed to map report.");
      }

      setFeedback(`Mapped report ${reportId.slice(0, 8)}… → test ${testId.slice(0, 8)}…`);
      await loadAll();
      setSelection(prev => {
        const next = { ...prev };
        delete next[reportId];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to map report.");
    } finally {
      setPending(prev => {
        const next = { ...prev };
        delete next[reportId];
        return next;
      });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-white">Email Mapping</h2>
        <p className="text-zinc-400 mt-2">
          Lab reports the system extracted from emails but could not auto-link to a Test.
          Pick the matching Test to attach the report. Reports keep all their molecule rows when mapped.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-700 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      {feedback ? (
        <div className="rounded-md border border-emerald-700 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          {feedback}
        </div>
      ) : null}

      {loading ? (
        <div className="text-zinc-400 text-sm">Loading…</div>
      ) : reports.length === 0 ? (
        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-zinc-200">Nothing to map</CardTitle>
            <CardDescription className="text-zinc-400">
              Every extracted lab report is currently linked to a Test. New unmapped reports will show up here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {reports.map(report => {
            const candidates = candidatesForReport(report);
            const lotMatchTest = candidates[0];
            const isLotMatch =
              lotMatchTest?.lot?.lot_number?.trim().toLowerCase() ===
              (report.lot_number || "").trim().toLowerCase();
            const moleculeCount = Array.isArray(report.moleculeResults)
              ? report.moleculeResults.length
              : 0;
            const productName =
              report.lotMatch?.product?.name ||
              report.metadata?.sampleName ||
              null;
            const variantName = report.lotMatch?.variant?.name || null;
            const companyName =
              report.lotMatch?.company?.name ||
              report.metadata?.clientName ||
              null;
            const selectedTestId = selection[report.id] || "";
            const selectedTest = candidates.find(t => t.id === selectedTestId);

            return (
              <Card key={report.id} className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl flex flex-col">
                <CardHeader>
                  <CardTitle className="text-lg text-white truncate" title={report.email?.subject ?? ""}>
                    {report.email?.subject || "(no subject)"}
                  </CardTitle>
                  <CardDescription className="text-zinc-400">
                    From: <span className="text-zinc-300">{report.email?.from_email || "Unknown"}</span>
                  </CardDescription>
                </CardHeader>

                <CardContent className="flex-1 space-y-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                      AI lot: {report.lot_number || "—"}
                    </Badge>
                    <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                      {moleculeCount} molecule rows
                    </Badge>
                    {report.source_attachment_filename || report.attachment?.original_filename ? (
                      <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                        {report.source_attachment_filename || report.attachment?.original_filename}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-zinc-700 text-zinc-300">
                        from email body
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs text-zinc-500 uppercase tracking-wider">Product</Label>
                      <p className="text-sm text-zinc-300 truncate" title={productName ?? ""}>
                        {productName || "—"}
                        {variantName ? <span className="text-zinc-500"> · {variantName}</span> : null}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-500 uppercase tracking-wider">Company</Label>
                      <p className="text-sm text-zinc-300 truncate" title={companyName ?? ""}>
                        {companyName || "—"}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-500 uppercase tracking-wider">Lab (AI)</Label>
                      <p className="text-sm text-zinc-300 truncate" title={report.metadata?.labName ?? ""}>
                        {report.metadata?.labName || "—"}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-500 uppercase tracking-wider">Received</Label>
                      <p className="text-sm text-zinc-300">
                        {report.email?.received_at
                          ? formatDistanceToNow(new Date(report.email.received_at), { addSuffix: true })
                          : "—"}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-zinc-800">
                    <Label className="text-xs text-zinc-500 uppercase tracking-wider mb-2 block">
                      Link to Test
                      {isLotMatch && lotMatchTest ? (
                        <span className="ml-2 text-emerald-400 normal-case">
                          ← lot-number match available
                        </span>
                      ) : null}
                    </Label>
                    {candidates.length === 0 ? (
                      <p className="text-sm text-amber-300">
                        No open Tests available. Create a Test first, then revisit this page.
                      </p>
                    ) : (
                      <Select
                        value={selectedTestId}
                        onValueChange={(value: string | null) =>
                          setSelection(prev => ({ ...prev, [report.id]: value ?? "" }))
                        }
                      >
                        <SelectTrigger className="w-full bg-zinc-950 border-zinc-700 text-zinc-200">
                          <SelectValue placeholder="Select a pending test…">
                            {selectedTest ? describeTest(selectedTest) : null}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                          {candidates.map(test => (
                            <SelectItem key={test.id} value={test.id}>
                              {describeTest(test)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </CardContent>

                <CardFooter className="pt-0">
                  <Button
                    onClick={() => handleMap(report.id)}
                    disabled={!selection[report.id] || pending[report.id]}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {pending[report.id] ? "Mapping…" : "Map Report to Test"}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
