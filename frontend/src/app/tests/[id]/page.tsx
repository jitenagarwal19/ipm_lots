"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getApiBaseUrl } from "@/lib/utils";

type Attachment = {
  id: string;
  original_filename?: string | null;
  file_url: string;
  file_type?: string | null;
};

type Email = {
  id: string;
  subject?: string | null;
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

type TestDetail = {
  id: string;
  status: string;
  createdAt: string;
  email_thread_id?: string | null;
  lot?: {
    id: string;
    lot_number: string;
    product?: { name?: string | null } | null;
    variant?: { name?: string | null } | null;
    company?: { name?: string | null } | null;
  } | null;
  lab?: { name?: string | null } | null;
  test_type?: { name?: string | null; country_standard?: string | null } | null;
  emails?: Email[];
  labReports?: LabReport[];
};

function getStatusStyle(status: string) {
  switch (status) {
    case "AWAITING_REPORT":
      return "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20";
    case "UNDER_REVIEW":
      return "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20";
    case "COMPLETED":
      return "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20";
    default:
      return "bg-zinc-500/10 text-zinc-400 hover:bg-zinc-500/20";
  }
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

export default function TestViewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [test, setTest] = useState<TestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadTest() {
      try {
        const res = await fetch(`${getApiBaseUrl()}/tests/${params.id}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load test.");
        }
        setTest(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load test.");
      } finally {
        setLoading(false);
      }
    }

    void loadTest();
  }, [params.id]);

  if (loading) {
    return <div className="text-zinc-500">Loading test...</div>;
  }

  if (error || !test) {
    return <div className="text-zinc-500">{error || "Test not found."}</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button type="button" onClick={() => router.back()} className="text-sm text-zinc-400 hover:text-white transition-colors">
            Back
          </button>
          <div className="flex flex-wrap items-center gap-4 mt-3">
            <h2 className="text-3xl font-bold tracking-tight text-white">{test.test_type?.name || "Unknown Test"}</h2>
            <Badge className={getStatusStyle(test.status)}>{test.status}</Badge>
          </div>
          <p className="text-zinc-400 mt-2">
            Lot:{" "}
            {test.lot ? (
              <Link href={`/lots/${test.lot.id}`} className="text-emerald-400 font-medium hover:underline">
                {test.lot.lot_number}
              </Link>
            ) : (
              "Unknown"
            )}{" "}
            | Lab: {test.lab?.name || "Unknown"}
          </p>
        </div>
        {test.labReports?.[0] && (
          <Link href={`/reviews/${test.labReports[0].id}`}>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white">Open Report Review</Button>
          </Link>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-white">Test Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Product</p>
              <p className="text-sm text-zinc-200 mt-1">{test.lot?.product?.name || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Company</p>
              <p className="text-sm text-zinc-200 mt-1">{test.lot?.company?.name || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Standard</p>
              <p className="text-sm text-zinc-200 mt-1">{test.test_type?.country_standard || "-"}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider">Created</p>
              <p className="text-sm text-zinc-200 mt-1">{format(new Date(test.createdAt), "MMM d, yyyy HH:mm")}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white">Report Reviews</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(test.labReports || []).length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-8">No report matched yet.</p>
            ) : (
              test.labReports?.map((report) => {
                const detectedMolecules = getDetectedMolecules(report);

                return (
                  <Link
                    key={report.id}
                    href={`/reviews/${report.id}`}
                    className="block rounded-md border border-zinc-800 bg-zinc-950/50 p-3 hover:bg-zinc-800/50"
                  >
                    <p className="text-sm text-zinc-100">{report.status}</p>
                    <p className="text-xs text-zinc-500 mt-1">
                      {report.source_type} | {report.moleculeResults?.length || 0} molecules
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {detectedMolecules.length > 0 ? (
                        detectedMolecules.slice(0, 5).map((molecule) => (
                          <Badge key={molecule.id} variant="outline" className={molecule.is_compliant === false ? "border-red-500/30 text-red-400" : "border-amber-500/30 text-amber-400"}>
                            {molecule.molecule_name}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-emerald-400">No detected molecules</span>
                      )}
                    </div>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-white">Email Thread</CardTitle>
            <CardDescription className="text-zinc-400">Communications linked to this test request.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-zinc-800 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-zinc-400">Date</TableHead>
                    <TableHead className="text-zinc-400">Direction</TableHead>
                    <TableHead className="text-zinc-400">Subject</TableHead>
                    <TableHead className="text-zinc-400">From</TableHead>
                    <TableHead className="text-zinc-400">Attachments</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(test.emails || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-zinc-500 py-8">No emails linked yet.</TableCell>
                    </TableRow>
                  ) : (
                    test.emails?.map((email) => (
                      <TableRow key={email.id} className="border-zinc-800 hover:bg-zinc-800/50">
                        <TableCell className="text-zinc-400 whitespace-nowrap">{format(new Date(email.received_at), "MMM d, HH:mm")}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={email.direction === "SENT" ? "text-blue-400 border-blue-500/20" : "text-emerald-400 border-emerald-500/20"}>
                            {email.direction}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-zinc-200">{email.subject || "-"}</TableCell>
                        <TableCell className="text-zinc-400">{email.from_email}</TableCell>
                        <TableCell className="text-zinc-300">{email.attachments?.length || 0}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
