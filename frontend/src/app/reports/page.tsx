"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, FileText, FlaskConical } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getApiBaseUrl } from "@/lib/utils";

type ScopeAlert = {
  id: string;
  status: string;
  requestedPanel?: string | null;
  receivedSize: number;
  detail?: string | null;
  reportCode?: string | null;
  lab: string;
  lots: string[];
  products: string[];
};

type Report = {
  id: string;
  reportCode?: string | null;
  reportDate?: string | null;
  reportKind: string;
  contaminantClass: string;
  sourceKind: string;
  lab: { code: string; name: string };
  entity: { code: string };
  lots: { lotCode: string; product?: string | null }[];
  resultCount: number;
  claimedMarket?: string | null;
  claimedVerdict?: string | null;
  verificationStatus: string;
  scopeChecks: { status: string }[];
};


const CLASS_LABEL: Record<string, string> = {
  PESTICIDE: "Pesticides",
  PYRROLIZIDINE_ALKALOID: "Pyrrolizidine alkaloids",
  ETHYLENE_OXIDE: "Ethylene oxide",
  QUAT_BAC: "BAC",
};

function verificationBadge(status: string) {
  switch (status) {
    case "VERIFIED":
      return <Badge className="bg-emerald-500/10 text-emerald-400">verified</Badge>;
    case "DISPUTED":
      return <Badge className="bg-red-500/10 text-red-400">disputed</Badge>;
    default:
      return <Badge className="bg-zinc-500/10 text-zinc-400">unverified</Badge>;
  }
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [alerts, setAlerts] = useState<ScopeAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const base = getApiBaseUrl();
        const [reportsRes, alertsRes] = await Promise.all([
          fetch(`${base}/reports`),
          fetch(`${base}/scope-alerts`),
        ]);
        if (!reportsRes.ok) throw new Error(`reports: HTTP ${reportsRes.status}`);
        if (!alertsRes.ok) throw new Error(`scope-alerts: HTTP ${alertsRes.status}`);
        setReports(await reportsRes.json());
        setAlerts(await alertsRes.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load report store.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <div className="text-zinc-400">Loading report store…</div>;
  if (error)
    return (
      <div className="text-red-400">
        Failed to load: {error}. Is the backend running on port 4000?
      </div>
    );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <FileText className="w-6 h-6 text-emerald-500" />
          Report Store
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Every lab report, with what was screened and what the lab claimed — verdicts are
          computed separately, never copied from the lab.
        </p>
      </div>

      {alerts.length > 0 && (
        <Card className="border-red-900/60 bg-red-950/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Scope alerts — ordered vs received
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Reports that do not cover what was ordered. Do not release against these.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {alerts.map((a) => (
              <div key={a.id} className="rounded-md border border-red-900/40 p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge className="bg-red-500/10 text-red-400">{a.status}</Badge>
                  <span className="font-mono">{a.reportCode}</span>
                  <span className="text-zinc-500">·</span>
                  <span>{a.lab}</span>
                  <span className="text-zinc-500">·</span>
                  <span className="font-mono">{a.lots.join(", ")}</span>
                  {a.products.length > 0 && (
                    <>
                      <span className="text-zinc-500">·</span>
                      <span className="text-zinc-400">{a.products.join(", ")}</span>
                    </>
                  )}
                </div>
                <div className="text-sm text-zinc-300 mt-2">
                  Ordered <span className="font-semibold">{a.requestedPanel ?? "?"}</span> —
                  received <span className="font-semibold">{a.receivedSize} analytes</span>
                </div>
                {a.detail && <p className="text-xs text-zinc-500 mt-1">{a.detail}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-emerald-500" />
            Reports ({reports.length})
          </CardTitle>
          <CardDescription>
            Across {new Set(reports.map((r) => r.lab.code)).size} labs ·{" "}
            {new Set(reports.flatMap((r) => r.lots.map((l) => l.lotCode))).size} lots
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Report</TableHead>
                <TableHead className="text-zinc-400">Lab</TableHead>
                <TableHead className="text-zinc-400">Lot(s)</TableHead>
                <TableHead className="text-zinc-400">Class</TableHead>
                <TableHead className="text-zinc-400">Source</TableHead>
                <TableHead className="text-zinc-400 text-right">Results</TableHead>
                <TableHead className="text-zinc-400">Lab claims</TableHead>
                <TableHead className="text-zinc-400">Transcription</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((r) => (
                <TableRow key={r.id} className="border-zinc-800">
                  <TableCell className="font-mono text-xs">
                    {r.reportCode ?? "—"}
                    <div className="text-zinc-500">
                      {r.reportDate ? new Date(r.reportDate).toLocaleDateString() : ""}
                    </div>
                  </TableCell>
                  <TableCell>{r.lab.code}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.lots.map((l) => (
                      <div key={l.lotCode}>
                        {l.lotCode}
                        {l.product && <span className="text-zinc-500"> · {l.product}</span>}
                      </div>
                    ))}
                  </TableCell>
                  <TableCell className="text-xs">
                    {CLASS_LABEL[r.contaminantClass] ?? r.contaminantClass}
                    {r.reportKind === "EXPORT_CLEARANCE" && (
                      <div className="text-zinc-500">export clearance</div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-400">
                    {r.sourceKind === "EMAIL_BODY_HTML" ? "email body" : "PDF"}
                  </TableCell>
                  <TableCell className="text-right">{r.resultCount}</TableCell>
                  <TableCell className="text-xs">
                    {r.claimedVerdict ? (
                      <>
                        <span
                          className={
                            /non.?compliance/i.test(r.claimedVerdict)
                              ? "text-red-400"
                              : "text-zinc-300"
                          }
                        >
                          {r.claimedVerdict}
                        </span>
                        {r.claimedMarket && (
                          <div className="text-zinc-500">for {r.claimedMarket}</div>
                        )}
                      </>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </TableCell>
                  <TableCell>{verificationBadge(r.verificationStatus)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
