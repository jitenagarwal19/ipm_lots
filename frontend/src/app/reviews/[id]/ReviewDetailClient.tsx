"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type MoleculeResult = {
  id: string;
  molecule_name: string;
  cas_number?: string | null;
  result?: string | null;
  numeric_result?: number | null;
  unit?: string | null;
  reporting_limit?: string | null;
  method_detection_limit?: string | null;
  specification_limit?: string | null;
  method?: string | null;
  status?: string | null;
  is_detected?: boolean | null;
  is_compliant?: boolean | null;
  notes?: string | null;
};

type Attachment = {
  id: string;
  original_filename?: string | null;
  file_url: string;
  file_type?: string | null;
  extracted_text?: string | null;
};

type ReviewReport = {
  id: string;
  lot_number?: string | null;
  source_type: string;
  source_attachment_filename?: string | null;
  status: string;
  metadata?: Record<string, unknown> | null;
  results?: { summary?: string | null; isValid?: boolean | null } | null;
  test?: {
    lot?: {
      lot_number?: string | null;
      product?: { name?: string | null } | null;
      variant?: { name?: string | null } | null;
      company?: { name?: string | null } | null;
    } | null;
    lab?: { name?: string | null } | null;
    test_type?: { name?: string | null } | null;
  } | null;
  email?: {
    subject?: string | null;
    body?: string | null;
    from_email: string;
    received_at: string;
    attachments?: Attachment[];
  } | null;
  attachment?: Attachment | null;
  moleculeResults?: MoleculeResult[];
};

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL || `http://${window.location.hostname}:4000/api`;
}

function getUploadBaseUrl() {
  if (typeof window === "undefined") return process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
  return process.env.NEXT_PUBLIC_BACKEND_URL || `http://${window.location.hostname}:4000`;
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Collapse duplicated unit tokens from extraction (e.g. "mg/kg mg/kg" in the unit field). */
function normalizeUnitTokens(unit: string): string {
  const parts = unit.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length && out[out.length - 1].toLowerCase() === p.toLowerCase()) continue;
    out.push(p);
  }
  return out.join(" ");
}

/** Remove repeated trailing copies of the same unit (e.g. "0.010 mg/kg mg/kg"). */
function collapseTrailingRepeatedUnit(display: string, unit: string): string {
  const u = unit.trim();
  if (!u) return display;
  const token = escapeRegExp(u);
  const re = new RegExp(`(?:\\s+${token})+$`, "i");
  const s = display.trim();
  const match = s.match(re);
  if (!match || match.index === undefined) return display;
  const base = s.slice(0, match.index).trimEnd();
  return base ? `${base} ${u}` : u;
}

function formatMoleculeResult(molecule: MoleculeResult) {
  const unit = normalizeUnitTokens((molecule.unit ?? "").trim());
  const result = (molecule.result ?? "").trim();
  const numeric = molecule.numeric_result;

  let display: string;

  if (result.length > 0) {
    if (unit && !result.toLowerCase().includes(unit.toLowerCase())) {
      display = `${result} ${unit}`;
    } else {
      display = result;
    }
  } else if (typeof numeric === "number" && Number.isFinite(numeric)) {
    display = unit ? `${numeric} ${unit}` : String(numeric);
  } else {
    return "-";
  }

  return unit ? collapseTrailingRepeatedUnit(display, unit) : display;
}

function isDetectedMolecule(molecule: MoleculeResult) {
  if (molecule.is_detected === true) return true;
  if (molecule.is_detected === false) return false;

  const combined = `${molecule.status || ""} ${molecule.result || ""}`.toLowerCase();
  if (combined.includes("not detected") || combined.includes("non detect") || /\bnd\b/.test(combined)) {
    return false;
  }

  return combined.includes("detected") || /\d/.test(combined);
}

export default function ReviewDetailClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<ReviewReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    async function loadReport() {
      try {
        const res = await fetch(`${getApiBaseUrl()}/reviews/${params.id}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load report review.");
        }
        setReport(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load report review.");
      } finally {
        setLoading(false);
      }
    }

    void loadReport();
  }, [params.id]);

  const approveReport = async () => {
    setApproving(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/reviews/${params.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Approved from report review screen." }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to approve report.");
      }
      router.push("/reviews");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to approve report.");
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return <div className="text-zinc-500">Loading report review...</div>;
  }

  if (error || !report) {
    return <div className="text-zinc-500">{error || "Report review not found."}</div>;
  }

  const metadataEntries = Object.entries(report.metadata || {});
  const sourceAttachment = report.attachment;
  const emailAttachments = report.email?.attachments || [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link href="/reviews" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Back to reviews
          </Link>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <h2 className="text-3xl font-bold tracking-tight text-white">
              {report.test?.lot?.lot_number || report.lot_number || "Unmapped Lot"}
            </h2>
            <Badge className="bg-amber-500/10 text-amber-400 hover:bg-amber-500/20">{report.status}</Badge>
            <Badge variant="outline" className="border-zinc-700 text-zinc-300">{report.source_type}</Badge>
          </div>
          <p className="text-zinc-400 mt-2">
            {report.test?.test_type?.name || "Unknown test"} | {report.test?.lab?.name || "Unknown lab"} | {report.email?.from_email || "Unknown sender"}
          </p>
        </div>
        <Button
          onClick={approveReport}
          disabled={approving || report.status === "APPROVED"}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {approving ? "Approving..." : "Approve Report"}
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
        <div className="space-y-6">
          <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-white">Extracted Summary</CardTitle>
              <CardDescription className="text-zinc-400">AI extracted fields waiting for human confirmation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
                  <p className="text-xs uppercase tracking-wider text-zinc-500">Result</p>
                  <p className="mt-1 text-sm text-zinc-100">{formatValue(report.results?.isValid)}</p>
                </div>
                <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
                  <p className="text-xs uppercase tracking-wider text-zinc-500">Source Attachment</p>
                  <p className="mt-1 text-sm text-zinc-100 break-words">{sourceAttachment?.original_filename || report.source_attachment_filename || "Email body"}</p>
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500">Summary</p>
                <p className="mt-2 whitespace-pre-wrap rounded-md border border-zinc-800 bg-zinc-950/50 p-3 text-sm text-zinc-200">
                  {report.results?.summary || "No summary returned."}
                </p>
              </div>
              {metadataEntries.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {metadataEntries.map(([key, value]) => (
                    <div key={key} className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
                      <p className="text-xs uppercase tracking-wider text-zinc-500">{key}</p>
                      <p className="mt-1 text-sm text-zinc-100 break-words">{formatValue(value)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card size="sm" className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm">Molecules Fetched</CardTitle>
              <CardDescription className="text-zinc-400 text-xs">Every molecule/analyte row extracted by AI.</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="rounded-md border border-zinc-800 overflow-x-auto">
                <Table className="text-xs">
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead className="h-8 py-1.5 px-2 text-zinc-400 font-medium">Molecule</TableHead>
                      <TableHead className="h-8 py-1.5 px-2 text-zinc-400 font-medium">Result</TableHead>
                      <TableHead className="h-8 py-1.5 px-2 text-zinc-400 font-medium">Limit</TableHead>
                      <TableHead className="h-8 py-1.5 px-2 text-zinc-400 font-medium">Detected</TableHead>
                      <TableHead className="h-8 py-1.5 px-2 text-zinc-400 font-medium">Compliant</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(report.moleculeResults || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-zinc-500 py-6">
                          No molecule rows were extracted.
                        </TableCell>
                      </TableRow>
                    ) : (
                      report.moleculeResults?.map((molecule) => (
                        <TableRow key={molecule.id} className="border-zinc-800 hover:bg-zinc-800/50">
                          <TableCell className="py-1.5 px-2 text-zinc-100 align-top whitespace-normal max-w-[12rem]">
                            <span className="font-medium leading-snug">{molecule.molecule_name}</span>
                            {molecule.cas_number && (
                              <span className="text-zinc-500"> · {molecule.cas_number}</span>
                            )}
                          </TableCell>
                          <TableCell className="py-1.5 px-2 text-zinc-300 whitespace-normal max-w-[9rem] leading-snug">
                            {formatMoleculeResult(molecule)}
                          </TableCell>
                          <TableCell className="py-1.5 px-2 text-zinc-400 tabular-nums">
                            {molecule.specification_limit || molecule.reporting_limit || "-"}
                          </TableCell>
                          <TableCell className="py-1.5 px-2">
                            <Badge
                              variant="outline"
                              className={
                                isDetectedMolecule(molecule)
                                  ? "h-5 border-amber-500/30 px-1.5 text-[10px] font-normal text-amber-400"
                                  : "h-5 border-zinc-700 px-1.5 text-[10px] font-normal text-zinc-400"
                              }
                            >
                              {isDetectedMolecule(molecule) ? "Detected" : "Not detected"}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-1.5 px-2">
                            <Badge
                              variant="outline"
                              className={
                                molecule.is_compliant === false
                                  ? "h-5 border-red-500/30 px-1.5 text-[10px] font-normal text-red-400"
                                  : "h-5 border-emerald-500/30 px-1.5 text-[10px] font-normal text-emerald-400"
                              }
                            >
                              {formatValue(molecule.is_compliant)}
                            </Badge>
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

        <div className="space-y-6">
          <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-white">Original Email Body</CardTitle>
              <CardDescription className="text-zinc-400">{report.email?.subject || "No subject"}</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md border border-zinc-800 bg-zinc-950/70 p-4 text-sm leading-6 text-zinc-200">
                {report.email?.body || "No email body was captured."}
              </pre>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-white">Attachment Evidence</CardTitle>
              <CardDescription className="text-zinc-400">The exact attachment text and file linked to this match.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {sourceAttachment ? (
                <>
                  <div className="flex items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-100">{sourceAttachment.original_filename}</p>
                      <p className="text-xs text-zinc-500">{sourceAttachment.file_type || "unknown file"}</p>
                    </div>
                    <a
                      href={`${getUploadBaseUrl()}${sourceAttachment.file_url}`}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-sm text-amber-400 hover:underline"
                    >
                      Open file
                    </a>
                  </div>
                  <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-md border border-zinc-800 bg-zinc-950/70 p-4 text-sm leading-6 text-zinc-200">
                    {sourceAttachment.extracted_text || "No text could be extracted from this attachment."}
                  </pre>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3 text-sm text-zinc-300">
                    This report was matched from the email body or the attachment could not be identified by filename.
                  </p>
                  {emailAttachments.length > 0 && (
                    <div className="space-y-2">
                      {emailAttachments.map((attachment) => (
                        <div key={attachment.id} className="rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
                          <p className="text-sm text-zinc-100">{attachment.original_filename || "Attachment"}</p>
                          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs leading-5 text-zinc-400">
                            {attachment.extracted_text || "No text extracted."}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
