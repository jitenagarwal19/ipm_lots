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
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400 whitespace-nowrap">Date</TableHead>
                <TableHead className="text-zinc-400 min-w-[10rem]">Test lot information</TableHead>
                <TableHead className="text-zinc-400 min-w-0 max-w-[18rem] w-[18rem]">Result</TableHead>
                <TableHead className="text-zinc-400">Lot number</TableHead>
                <TableHead className="text-zinc-400">Test type</TableHead>
                <TableHead className="text-zinc-400">Lab</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-zinc-400">Compliance</TableHead>
                <TableHead className="text-zinc-400">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-zinc-500 py-8">Loading tests...</TableCell>
                </TableRow>
              ) : tests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-zinc-500 py-8">No tests initiated yet.</TableCell>
                </TableRow>
              ) : (
                tests.map((test) => {
                  const info = lotInfoLines(test);
                  const summary = resultSummary(test);
                  const pending = pendingReviewReport(test);
                  const compliance = complianceSummary(test);
                  return (
                  <TableRow key={test.id} className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                    <TableCell className="whitespace-nowrap text-zinc-400 align-top">
                      {new Date(test.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-zinc-300 text-sm align-top">
                      <div className="space-y-0.5 max-w-xs">
                        <div><span className="text-zinc-500">Product</span> {info.product}</div>
                        <div><span className="text-zinc-500">Vendor</span> {info.vendor}</div>
                        <div><span className="text-zinc-500">Sampled by</span> {info.sampled}</div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top min-w-0 max-w-[18rem] w-[18rem]">
                      <span
                        title={summary.text !== "—" ? summary.text : undefined}
                        className={
                          "block w-full min-w-0 truncate text-sm cursor-help " +
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
                    <TableCell className="font-medium text-emerald-400 cursor-pointer hover:underline align-top">
                      <Link href={`/lots/${test.lot_id}`}>
                        {test.lot?.lot_number || "Unknown"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-zinc-200 align-top">
                      <Link href={`/tests/${test.id}`} className="hover:text-emerald-400 hover:underline">
                        {test.test_type?.name || "Unknown"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-zinc-400 align-top">{test.lab?.name || "Unknown"}</TableCell>
                    <TableCell className="align-top">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusStyle(test.status)}`}>
                        {test.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-zinc-300 align-top">
                      {compliance.length > 0 ? (
                        <div className="flex max-w-[14rem] flex-wrap gap-1">
                          {compliance.map((check) => (
                            <span key={check.id} className="inline-flex rounded-full border border-emerald-500/30 px-2 py-0.5 text-[10px] text-emerald-400">
                              {check.label}: {check.status}
                            </span>
                          ))}
                        </div>
                      ) : test.status === "COMPLIANCE_PENDING" ? (
                        <span className="text-amber-400 text-sm">Pending</span>
                      ) : (
                        <span className="text-zinc-600">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-zinc-300 align-top">
                      {pending ? (
                        <Link href={`/reviews/${pending.id}`} className="text-amber-400 hover:underline text-sm">
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
