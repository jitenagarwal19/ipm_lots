"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type Attachment = {
  id: string;
  original_filename?: string | null;
  file_url: string;
  file_type?: string | null;
};

type Email = {
  id: string;
  subject?: string | null;
  body?: string | null;
  from_email: string;
  to_email?: string | null;
  direction: string;
  received_at: string;
  attachments?: Attachment[];
};

type MoleculeResult = {
  id: string;
  molecule_name: string;
  result?: string | null;
  status?: string | null;
  is_detected?: boolean | null;
  is_compliant?: boolean | null;
};

type LabReport = {
  id: string;
  status: string;
  source_type: string;
  source_attachment_filename?: string | null;
  moleculeResults?: MoleculeResult[];
};

type LotTest = {
  id: string;
  status: string;
  createdAt: string;
  lab?: { name?: string | null } | null;
  test_type?: { name?: string | null; country_standard?: string | null } | null;
  emails?: Email[];
  labReports?: LabReport[];
};

type LotDetail = {
  id: string;
  lot_number: string;
  createdAt: string;
  product?: { name?: string | null } | null;
  variant?: { name?: string | null } | null;
  company?: { name?: string | null } | null;
  tests?: LotTest[];
};

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL || `http://${window.location.hostname}:4000/api`;
}

function getStatusStyle(status: string) {
  switch (status) {
    case "INITIATED":
      return "text-zinc-400 border-zinc-500/20";
    case "AWAITING_REPORT":
      return "text-blue-400 border-blue-500/20";
    case "UNDER_REVIEW":
      return "text-amber-400 border-amber-500/20";
    case "COMPLETED":
      return "text-emerald-400 border-emerald-500/20";
    default:
      return "text-zinc-400 border-zinc-500/20";
  }
}

function getUploadBaseUrl() {
  if (typeof window === "undefined") return process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
  return process.env.NEXT_PUBLIC_BACKEND_URL || `http://${window.location.hostname}:4000`;
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

function getDetectedMolecules(report: LabReport) {
  return (report.moleculeResults || []).filter(isDetectedMolecule);
}

export default function LotViewPage() {
  const params = useParams<{ id: string }>();
  const [lot, setLot] = useState<LotDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadLot() {
      try {
        const res = await fetch(`${getApiBaseUrl()}/lots/${params.id}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load lot.");
        }
        setLot(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load lot.");
      } finally {
        setLoading(false);
      }
    }

    void loadLot();
  }, [params.id]);

  const communications = useMemo(() => {
    const emails = lot?.tests?.flatMap((test) =>
      (test.emails || []).map((email) => ({
        ...email,
        testType: test.test_type?.name || "Unknown test",
      }))
    ) || [];

    const uniqueById = new Map<string, Email & { testType: string }>();
    for (const email of emails) {
      uniqueById.set(email.id, email);
    }

    return Array.from(uniqueById.values()).sort(
      (a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
    );
  }, [lot]);

  if (loading) {
    return <div className="text-zinc-500">Loading lot...</div>;
  }

  if (error || !lot) {
    return <div className="text-zinc-500">{error || "Lot not found."}</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <div>
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="text-3xl font-bold tracking-tight text-white">{lot.lot_number}</h2>
          {lot.product?.name && (
            <Badge className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20">{lot.product.name}</Badge>
          )}
          {lot.variant?.name && (
            <Badge variant="outline" className="border-zinc-700 text-zinc-300">{lot.variant.name}</Badge>
          )}
        </div>
        <p className="text-zinc-400 mt-2">
          Exporter: {lot.company?.name || "Unknown"} | Created: {format(new Date(lot.createdAt), "MMM d, yyyy")}
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(420px,0.8fr)]">
        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white">Tests for this Lot</CardTitle>
            <CardDescription className="text-zinc-400">All requested tests and matched review reports.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-zinc-800 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-zinc-400">Type</TableHead>
                    <TableHead className="text-zinc-400">Lab</TableHead>
                    <TableHead className="text-zinc-400">Standard</TableHead>
                    <TableHead className="text-zinc-400">Status</TableHead>
                    <TableHead className="text-zinc-400">Reports</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(lot.tests || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-zinc-500 py-8">No tests found for this lot.</TableCell>
                    </TableRow>
                  ) : (
                    lot.tests?.map((test) => (
                      <TableRow key={test.id} className="border-zinc-800 hover:bg-zinc-800/50">
                        <TableCell className="font-medium text-zinc-200">{test.test_type?.name || "Unknown"}</TableCell>
                        <TableCell className="text-zinc-400">{test.lab?.name || "Unknown"}</TableCell>
                        <TableCell className="text-zinc-400">{test.test_type?.country_standard || "-"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getStatusStyle(test.status)}>
                            {test.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-zinc-300">
                          {(test.labReports || []).length > 0 ? (
                            <div className="flex flex-col gap-1">
                              {test.labReports?.map((report) => {
                                const detectedMolecules = getDetectedMolecules(report);

                                return (
                                  <div key={report.id} className="space-y-2">
                                    <Link href={`/reviews/${report.id}`} className="text-amber-400 hover:underline text-sm">
                                      {report.status} | {report.moleculeResults?.length || 0} molecules
                                    </Link>
                                    <div className="flex flex-wrap gap-1">
                                      {detectedMolecules.length > 0 ? (
                                        detectedMolecules.slice(0, 6).map((molecule) => (
                                          <Badge key={molecule.id} variant="outline" className={molecule.is_compliant === false ? "border-red-500/30 text-red-400" : "border-amber-500/30 text-amber-400"}>
                                            {molecule.molecule_name}
                                          </Badge>
                                        ))
                                      ) : (
                                        <span className="text-xs text-emerald-400">No detected molecules</span>
                                      )}
                                      {detectedMolecules.length > 6 && (
                                        <span className="text-xs text-zinc-500">+{detectedMolecules.length - 6} more</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-zinc-600">-</span>
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

        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white">Linked Communications</CardTitle>
            <CardDescription className="text-zinc-400">Emails and attachments mapped to tests in this lot.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {communications.map((email) => (
                <div key={email.id} className="rounded-lg bg-zinc-800/30 border border-zinc-800 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-200 truncate" title={email.subject || ""}>
                        {email.subject || "No subject"}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">
                        {email.direction} | {email.testType} | {format(new Date(email.received_at), "MMM d, yyyy HH:mm")}
                      </p>
                    </div>
                    <Badge variant="secondary" className="bg-zinc-800 text-zinc-300">
                      {email.attachments?.length || 0}
                    </Badge>
                  </div>
                  {(email.attachments || []).length > 0 && (
                    <div className="mt-3 space-y-1">
                      {email.attachments?.map((attachment) => (
                        <a
                          key={attachment.id}
                          href={`${getUploadBaseUrl()}${attachment.file_url}`}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-xs text-amber-400 hover:underline"
                          title={attachment.original_filename || attachment.file_url}
                        >
                          {attachment.original_filename || attachment.file_url}
                        </a>
                      ))}
                    </div>
                  )}
                  {email.body && (
                    <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/50 p-3">
                      <p className="text-xs uppercase tracking-wider text-zinc-500">Email body</p>
                      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs leading-5 text-zinc-300">
                        {email.body}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
              {communications.length === 0 && (
                <p className="text-sm text-zinc-500 text-center py-4">No emails linked yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
