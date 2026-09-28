"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getApiBaseUrl } from "@/lib/utils";

type TestRow = {
  id: string;
  lot_id: string;
  status: string;
  createdAt: string;
  lot?: {
    lot_number?: string | null;
    product?: { name?: string | null } | null;
  } | null;
  vendor?: { name?: string | null } | null;
  sampled_by_staff?: { name?: string | null } | null;
  test_type?: {
    name?: string | null;
  } | null;
  lab?: {
    name?: string | null;
  } | null;
  labReports?: {
    id: string;
    status: string;
    complianceChecks?: {
      id: string;
      status: string;
      is_compliant?: boolean | null;
      checked_at?: string | null;
      standard?: {
        code?: string | null;
        name?: string | null;
      } | null;
    }[];
    moleculeResults?: {
      id: string;
      molecule_name: string;
      result?: string | null;
      status?: string | null;
      is_detected?: boolean | null;
      is_compliant?: boolean | null;
    }[];
  }[];
};

/** "COMPLIANCE_PENDING" -> "Compliance pending". A raw enum reads like an error and cannot wrap. */
function statusLabel(status: string | null | undefined): string {
  if (!status) return "-";
  const words = status.toLowerCase().split("_");
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
}

export default function TestsPage() {
  const [tests, setTests] = useState<TestRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTests = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/tests`);
      if (res.ok) {
        const data = await res.json();
        setTests(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetching initial API state on mount is intentional for this page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTests();
  }, []);

  const lotInfoLines = (test: TestRow) => {
    const product = test.lot?.product?.name?.trim() || "—";
    const vendor = test.vendor?.name?.trim() || "—";
    const sampled = test.sampled_by_staff?.name?.trim() || "—";
    return { product, vendor, sampled };
  };

  type ListMolecule = NonNullable<NonNullable<TestRow["labReports"]>[number]["moleculeResults"]>[number];

  function isDetectedMolecule(molecule: ListMolecule) {
    if (molecule.is_detected === true) return true;
    if (molecule.is_detected === false) return false;
    const combined = `${molecule.status || ""} ${molecule.result || ""}`.toLowerCase();
    if (combined.includes("not detected") || combined.includes("non detect") || /\bnd\b/.test(combined)) {
      return false;
    }
    return combined.includes("detected") || /\d/.test(combined);
  }

  function resultSummary(test: TestRow): { text: string; tone: "default" | "ok" | "warn" } {
    const reports = test.labReports || [];
    const withMols = reports.find((r) => (r.moleculeResults?.length ?? 0) > 0) ?? reports[0];
    const molecules = withMols?.moleculeResults || [];
    if (molecules.length === 0) {
      return { text: "—", tone: "default" };
    }
    const detected = molecules.filter(isDetectedMolecule);
    if (detected.length === 0) {
      return { text: "No detections", tone: "ok" };
    }
    const parts = detected.slice(0, 4).map((m) => {
      const val = (m.result || m.status || "").trim();
      return val ? `${m.molecule_name}: ${val}` : m.molecule_name;
    });
    const extra = detected.length > 4 ? ` +${detected.length - 4} more` : "";
    const nonCompliant = detected.some((m) => m.is_compliant === false);
    return {
      text: parts.join(" · ") + extra,
      tone: nonCompliant ? "warn" : "default",
    };
  }

  function pendingReviewReport(test: TestRow) {
    return test.labReports?.find((r) => r.status === "PENDING_REVIEW" || r.status === "COMPLIANCE_PENDING");
  }

  function complianceSummary(test: TestRow) {
    const checks = (test.labReports || []).flatMap((r) => r.complianceChecks || []);
    if (checks.length === 0) return [];
    return checks.slice(0, 3).map((check) => ({
      id: check.id,
      label: check.standard?.name || check.standard?.code || "Compliance",
      status: check.status,
    }));
  }

  const getStatusStyle = (status: string) => {
    switch(status) {
      case 'INITIATED': return 'bg-zinc-500/10 text-zinc-400';
      case 'AWAITING_REPORT': return 'bg-blue-500/10 text-blue-400';
      case 'REPORT_RECEIVED': return 'bg-purple-500/10 text-purple-400';
      case 'UNDER_REVIEW': return 'bg-amber-500/10 text-amber-400';
      case 'COMPLIANCE_PENDING': return 'bg-orange-500/10 text-orange-400';
      case 'COMPLETED': return 'bg-emerald-500/10 text-emerald-400';
      default: return 'bg-zinc-500/10 text-zinc-400';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Tests & Lots</h2>
          <p className="text-zinc-400 mt-2">Manage your spice lots and lab test requests.</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/tests/new">
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium">
              Create Test Request
            </Button>
          </Link>
        </div>
      </div>

      <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-white">Recent Tests</CardTitle>
          <CardDescription className="text-zinc-400">View and track the status of all tests.</CardDescription>
        </CardHeader>
        <CardContent>
          {/*
            Six columns, not nine. Nine could not fit a laptop screen at any setting:
            badges and links refuse to shrink, so every column that could truncate
            collapsed to nothing ("E…", "Pestici…") while the badges kept full width.
            Related fields now stack in one cell, the way lot information already did.

            table-fixed makes the table exactly as wide as its container — widths are
            allocated rather than negotiated from content, so no single long value can
            push the rest off screen.
          */}
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="w-[92px] text-zinc-400">Date</TableHead>
                <TableHead className="w-[24%] text-zinc-400">Lot</TableHead>
                <TableHead className="hidden w-[22%] text-zinc-400 md:table-cell">Test</TableHead>
                <TableHead className="text-zinc-400">Result</TableHead>
                <TableHead className="w-[17%] text-zinc-400">Status</TableHead>
                <TableHead className="w-[112px] text-right text-zinc-400">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-zinc-500">Loading tests...</TableCell>
                </TableRow>
              ) : tests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-zinc-500">No tests initiated yet.</TableCell>
                </TableRow>
              ) : (
                tests.map((test) => {
                  const info = lotInfoLines(test);
                  const summary = resultSummary(test);
                  const pending = pendingReviewReport(test);
                  const compliance = complianceSummary(test);
                  return (
                  <TableRow key={test.id} className="border-zinc-800 transition-colors hover:bg-zinc-800/50">
                    <TableCell className="whitespace-nowrap align-top text-zinc-400">
                      {new Date(test.createdAt).toLocaleDateString()}
                    </TableCell>

                    {/* Lot: the identifier first, then what it is */}
                    <TableCell className="align-top">
                      <Link
                        href={`/lots/${test.lot_id}`}
                        className="block truncate font-medium text-emerald-400 hover:underline"
                        title={test.lot?.lot_number || undefined}
                      >
                        {test.lot?.lot_number || "Unknown"}
                      </Link>
                      <div className="truncate text-sm text-zinc-300" title={info.product}>{info.product}</div>
                      <div className="truncate text-xs text-zinc-500" title={`${info.vendor} · ${info.sampled}`}>
                        {info.vendor} · {info.sampled}
                      </div>
                    </TableCell>

                    {/* Test: what was run, and where */}
                    <TableCell className="hidden align-top md:table-cell">
                      <Link
                        href={`/tests/${test.id}`}
                        className="block truncate text-zinc-200 hover:text-emerald-400 hover:underline"
                        title={test.test_type?.name ?? undefined}
                      >
                        {test.test_type?.name || "Unknown"}
                      </Link>
                      <div className="truncate text-xs text-zinc-500" title={test.lab?.name ?? undefined}>
                        {test.lab?.name || "Unknown"}
                      </div>
                    </TableCell>

                    {/* Result takes the remaining width, and two lines rather than one —
                        the molecule list is what people come to this page to read. */}
                    <TableCell className="align-top">
                      <span
                        title={summary.text !== "—" ? summary.text : undefined}
                        className={
                          "line-clamp-2 break-words text-sm " +
                          (summary.tone === "ok"
                            ? "text-emerald-400/90"
                            : summary.tone === "warn"
                              ? "text-amber-300/90"
                              : "text-zinc-300")
                        }
                      >
                        {summary.text}
                      </span>
                    </TableCell>

                    {/* Status, with the per-market verdicts beneath it */}
                    <TableCell className="align-top">
                      <span
                        className={`inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusStyle(test.status)}`}
                        title={test.status}
                      >
                        <span className="truncate">{statusLabel(test.status)}</span>
                      </span>
                      {compliance.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {compliance.map((check) => (
                            <span
                              key={check.id}
                              title={`${check.label}: ${check.status}`}
                              className="inline-flex max-w-full rounded-full border border-emerald-500/30 px-1.5 py-0.5 text-[10px] text-emerald-400"
                            >
                              <span className="truncate">{check.label}: {check.status}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="align-top text-right">
                      {pending ? (
                        <Link href={`/reviews/${pending.id}`} className="text-sm text-amber-400 hover:underline">
                          {pending.status === "COMPLIANCE_PENDING" ? "Check compliance" : "Review report"}
                        </Link>
                      ) : (
                        <span className="text-zinc-600">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
