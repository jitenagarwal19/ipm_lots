"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, HelpCircle, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

/**
 * Country compliance — one verdict per destination market.
 *
 * Replaces a "Check country-wise compliant" button that revealed a single-market
 * dropdown. Two problems with that: it made the most important answer opt-in,
 * and it only ever showed one market at a time, so "compliant" appeared on
 * screen without saying compliant *where*.
 *
 * Every verdict here is computed by our own engine against our own MRL tables.
 * The limit printed on a lab report is recorded separately as the lab's claim,
 * because labs have been wrong: in May 2026 AVES gave a UK Fluxapyroxad limit
 * of 0.050 and stamped "Compliance"; the real limit is 0.010 and the correct
 * verdict was Non Compliance.
 */

type PreviewRow = {
  moleculeResultId: string;
  moleculeName: string;
  result?: string | null;
  measuredValue?: number | null;
  measuredUnit?: string | null;
  limitValue: number;
  limitUnit: string;
  limitSource: string;
  /** VALUE | AT_LOD | NOT_REQUIRED | PROHIBITED */
  limitKind?: string | null;
  /** The register's own text, e.g. "0.05 *", "No MRL Required". */
  limitSourceValue?: string | null;
  /** Full published residue definition the limit is legally set on. */
  residueDefinition?: string | null;
  fallbackUsed: boolean;
  isCompliant?: boolean | null;
};

/**
 * Exempt and prohibited limits are stored as sentinels, never as a published
 * number, so the number must never reach the screen for those kinds.
 */
function limitLabel(row: PreviewRow): string {
  if (row.limitKind === "NOT_REQUIRED") return "No MRL required";
  if (row.limitKind === "PROHIBITED") return "Must not be detected";
  if (row.limitKind === "AT_LOD") return `${row.limitValue} ${row.limitUnit} *`;
  return `${row.limitValue} ${row.limitUnit}`;
}

/** A sentinel limit has no meaningful "% of limit". */
function hasNumericLimit(row: PreviewRow): boolean {
  return row.limitKind !== "NOT_REQUIRED" && row.limitKind !== "PROHIBITED";
}

type Standard = { id: string; code: string; name: string; fallback_limit: number };

type MarketResult = {
  standard: Standard;
  rows: PreviewRow[];
  error?: string;
};

type Verdict = "PASS" | "FAIL" | "INDETERMINATE";

/**
 * A row is only a confident PASS when we hold a real limit for it. Where the
 * regime default had to be used, we know the substance was detected but not
 * what it is judged against here — that is INDETERMINATE, never PASS.
 */
function verdictFor(rows: PreviewRow[]): { verdict: Verdict; over: PreviewRow[]; unknown: PreviewRow[] } {
  const over = rows.filter((r) => r.isCompliant === false);
  const unknown = rows.filter((r) => r.isCompliant !== false && r.fallbackUsed);
  if (over.length > 0) return { verdict: "FAIL", over, unknown };
  if (unknown.length > 0) return { verdict: "INDETERMINATE", over, unknown };
  return { verdict: "PASS", over, unknown };
}

/** How close a detected residue sits to its limit — the binding constraint. */
function percentOfLimit(row: PreviewRow): number | null {
  if (row.measuredValue == null || !row.limitValue) return null;
  if (!hasNumericLimit(row)) return null;
  return (row.measuredValue / row.limitValue) * 100;
}

function VerdictChip({ verdict }: { verdict: Verdict }) {
  if (verdict === "PASS")
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-400">
        <Check className="h-3.5 w-3.5" /> PASS
      </span>
    );
  if (verdict === "FAIL")
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-400">
        <X className="h-3.5 w-3.5" /> FAIL
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-400">
      <HelpCircle className="h-3.5 w-3.5" /> CAN&apos;T SAY
    </span>
  );
}

export function CountryCompliance({
  reportId,
  apiBaseUrl,
}: {
  reportId: string;
  apiBaseUrl: string;
}) {
  const [markets, setMarkets] = useState<MarketResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const stdRes = await fetch(`${apiBaseUrl}/settings/compliance-standards`);
        if (!stdRes.ok) throw new Error(`Could not load regulations (HTTP ${stdRes.status})`);
        const standards: Standard[] = await stdRes.json();
        const active = standards.filter((s) => s.code);

        const results = await Promise.all(
          active.map(async (standard) => {
            try {
              const res = await fetch(`${apiBaseUrl}/reviews/${reportId}/compliance/${standard.id}/preview`);
              if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                return { standard, rows: [], error: body.error || `HTTP ${res.status}` };
              }
              const data = await res.json();
              return { standard, rows: (data.rows ?? []) as PreviewRow[] };
            } catch (e) {
              return { standard, rows: [], error: e instanceof Error ? e.message : "failed" };
            }
          })
        );

        if (!cancelled) setMarkets(results);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to evaluate compliance.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [reportId, apiBaseUrl]);

  if (loading) {
    return (
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white text-sm">Country compliance</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-500">Evaluating against your MRL tables…</CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-zinc-900/50 border-red-900/50">
        <CardHeader>
          <CardTitle className="text-red-400 text-sm">Country compliance</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-red-400">{error}</CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-white">Country compliance</CardTitle>
        <CardDescription className="text-zinc-400">
          Computed from <span className="text-zinc-300">your</span> MRL tables — not from the limit printed on
          the lab report. Click a market for the detail.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {markets.length === 0 && (
          <p className="text-sm text-zinc-500">
            No regulations configured. Add them under Settings → Compliance.
          </p>
        )}

        {markets.map((m) => {
          const { verdict, over, unknown } = verdictFor(m.rows);
          const isOpen = expanded === m.standard.id;

          // Highest proportion of its limit among rows we can actually judge.
          const binding = m.rows
            .filter((r) => !r.fallbackUsed && percentOfLimit(r) !== null)
            .sort((a, b) => (percentOfLimit(b) ?? 0) - (percentOfLimit(a) ?? 0))[0];

          return (
            <div key={m.standard.id} className="rounded-md border border-zinc-800 bg-zinc-950/40">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : m.standard.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-zinc-900/60"
              >
                <div className="flex items-center gap-3">
                  <span className="w-10 font-mono text-sm font-semibold text-zinc-200">{m.standard.code}</span>
                  {m.error ? (
                    <span className="text-xs text-red-400">{m.error}</span>
                  ) : (
                    <VerdictChip verdict={verdict} />
                  )}
                </div>

                {!m.error && (
                  <div className="flex items-center gap-3 text-xs text-zinc-400">
                    {over.length > 0 && (
                      <span className="text-red-400">
                        {over.length} over limit
                        {over.length <= 2 && <> — {over.map((r) => r.moleculeName).join(", ")}</>}
                      </span>
                    )}
                    {over.length === 0 && unknown.length > 0 && (
                      <span className="text-amber-400">
                        {unknown.length} with no {m.standard.code} limit on file
                      </span>
                    )}
                    {verdict === "PASS" && binding && (
                      <span>
                        closest: {binding.moleculeName} at {percentOfLimit(binding)?.toFixed(0)}% of limit
                      </span>
                    )}
                    <span className="text-zinc-600">{m.rows.length} detected</span>
                  </div>
                )}
              </button>

              {isOpen && !m.error && (
                <div className="border-t border-zinc-800 px-3 py-2">
                  {m.rows.length === 0 ? (
                    <p className="py-3 text-center text-xs text-zinc-500">
                      No detected residues to evaluate.
                    </p>
                  ) : (
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow className="border-zinc-800 hover:bg-transparent">
                          <TableHead className="h-7 px-2 text-zinc-500">Molecule</TableHead>
                          <TableHead className="h-7 px-2 text-zinc-500">Result</TableHead>
                          <TableHead className="h-7 px-2 text-zinc-500">{m.standard.code} limit</TableHead>
                          <TableHead className="h-7 px-2 text-zinc-500">% of limit</TableHead>
                          <TableHead className="h-7 px-2 text-zinc-500">Verdict</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {m.rows.map((r) => {
                          const pct = percentOfLimit(r);
                          return (
                            <TableRow key={r.moleculeResultId} className="border-zinc-800">
                              <TableCell className="px-2 py-1.5 text-zinc-200" title={r.residueDefinition ?? undefined}>
                                {r.moleculeName}
                              </TableCell>
                              <TableCell className="px-2 py-1.5 tabular-nums text-zinc-300">
                                {r.measuredValue ?? r.result ?? "-"}
                                {r.measuredUnit ? ` ${r.measuredUnit}` : ""}
                              </TableCell>
                              <TableCell
                                className="px-2 py-1.5 tabular-nums text-zinc-300"
                                title={
                                  r.limitKind === "AT_LOD"
                                    ? "Set at the limit of determination — no approved use"
                                    : r.limitKind === "NOT_REQUIRED"
                                      ? "Annex IV exempt — no MRL applies to this substance"
                                      : undefined
                                }
                              >
                                {limitLabel(r)}
                                {r.fallbackUsed && (
                                  <span className="ml-1 text-amber-500" title="No specific limit on file — regime default applied">
                                    ⚠
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="px-2 py-1.5 tabular-nums">
                                {pct === null ? (
                                  <span className="text-zinc-600">—</span>
                                ) : (
                                  <span
                                    className={
                                      pct > 100
                                        ? "text-red-400"
                                        : pct > 70
                                          ? "text-amber-400"
                                          : "text-zinc-400"
                                    }
                                  >
                                    {pct.toFixed(0)}%
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="px-2 py-1.5">
                                {r.isCompliant === false ? (
                                  <Badge variant="outline" className="h-5 border-red-500/30 px-1.5 text-[10px] font-normal text-red-400">
                                    Over limit
                                  </Badge>
                                ) : r.limitKind === "NOT_REQUIRED" ? (
                                  <Badge variant="outline" className="h-5 border-zinc-600/40 px-1.5 text-[10px] font-normal text-zinc-400">
                                    Exempt
                                  </Badge>
                                ) : r.fallbackUsed ? (
                                  <Badge variant="outline" className="h-5 border-amber-500/30 px-1.5 text-[10px] font-normal text-amber-400">
                                    No limit on file
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="h-5 border-emerald-500/30 px-1.5 text-[10px] font-normal text-emerald-400">
                                    Within limit
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {markets.some((m) => verdictFor(m.rows).unknown.length > 0) && (
          <p className="flex items-start gap-1.5 pt-1 text-xs text-amber-500/80">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              &ldquo;Can&apos;t say&rdquo; means a residue was detected but no limit for that market is on file, so the
              regime default was applied. Add the limit under Settings → Compliance to get a firm answer.
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
