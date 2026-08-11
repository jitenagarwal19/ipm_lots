"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Search } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { getApiBaseUrl } from "@/lib/utils";

/**
 * MRL lookup — "what is the limit for chlorpyrifos in coriander seed for the UK".
 *
 * Answers for every market at once rather than one at a time. The single-market
 * question is the one people ask; the all-markets answer is the one that decides
 * where a lot can actually go, and it costs nothing extra to show.
 *
 * Three cell states, never collapsed into each other:
 *   LIMIT           we hold a researched limit
 *   REGIME_DEFAULT  no entry for this substance; the regime default would apply
 *   NO_PROFILE      this product is not set up for that market at all
 * A default shown as though it were a limit is how an unverified number ends up
 * behind a release decision.
 */

const API_BASE_URL = getApiBaseUrl();

type MoleculeHit = {
  id: string;
  name: string;
  cas_number: string | null;
  matchedAlias: string | null;
  limitCount: number;
};

type Standard = { id: string; code: string; name: string; fallback_limit: number; fallback_unit: string };

type Cell =
  | {
      state: "LIMIT";
      limit_value: number;
      limit_kind: string;
      unit: string;
      source_value: string | null;
      residue_definition: string | null;
      is_sum_definition: boolean;
      enforcement_date: string | null;
      regulation_ref: string | null;
      footnotes: string | null;
      feasibility: boolean | null;
      feasibility_note: string | null;
      nabl: boolean | null;
      nabl_note: string | null;
      source_commodity: string | null;
      snapshot_date: string | null;
      verification_status: string;
      notes: string | null;
    }
  | { state: "REGIME_DEFAULT"; limit_value: number; unit: string }
  | { state: "NO_PROFILE" };

type Row = { product: { id: string; name: string }; cells: Record<string, Cell> };

type Lookup = {
  molecule: { id: string; name: string; cas_number: string | null; aliases: string[] };
  standards: Standard[];
  rows: Row[];
};

/** Exempt and prohibited limits store a sentinel — the number must never be shown. */
function cellText(cell: Cell): string {
  if (cell.state === "NO_PROFILE") return "—";
  if (cell.state === "REGIME_DEFAULT") return `default ${cell.limit_value}`;
  if (cell.limit_kind === "NOT_REQUIRED") return "No MRL req.";
  if (cell.limit_kind === "PROHIBITED") return "Prohibited";
  if (cell.limit_kind === "AT_LOD") return `${cell.limit_value} *`;
  return `${cell.limit_value}`;
}

function cellClass(cell: Cell): string {
  if (cell.state === "NO_PROFILE") return "text-zinc-700";
  if (cell.state === "REGIME_DEFAULT") return "text-amber-400";
  if (cell.limit_kind === "PROHIBITED") return "text-red-400";
  if (cell.limit_kind === "NOT_REQUIRED") return "text-zinc-400";
  return "text-emerald-300";
}

function cellTitle(cell: Cell): string {
  if (cell.state === "NO_PROFILE") return "This product has no profile for this market.";
  if (cell.state === "REGIME_DEFAULT")
    return `No entry for this substance. The regime default of ${cell.limit_value} ${cell.unit} would be applied — an assumption, not a researched limit.`;
  if (cell.limit_kind === "AT_LOD")
    return "Set at the limit of determination — no approved use. A detection below it is legal but real.";
  if (cell.limit_kind === "NOT_REQUIRED") return "Annex IV exempt — no MRL applies to this substance.";
  if (cell.limit_kind === "PROHIBITED") return "Prohibited — must not be detected.";
  return `${cell.limit_value} ${cell.unit}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB");
}

export default function LimitsPage() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MoleculeHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [selected, setSelected] = useState<{ productName: string; standard: Standard; cell: Cell } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const loadMolecule = useCallback(async (id: string) => {
    setError(null);
    setSelected(null);
    try {
      const res = await fetch(`${API_BASE_URL}/limits/molecule/${id}`);
      if (!res.ok) throw new Error(`Could not load limits (HTTP ${res.status})`);
      const data: Lookup = await res.json();
      setLookup(data);
      const url = new URL(window.location.href);
      url.searchParams.set("molecule", id);
      window.history.replaceState(null, "", url.toString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed.");
    }
  }, []);

  // Debounced search. A stale response must never overwrite a newer one.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/limits/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (seq !== requestSeq.current) return;
        setHits(data.molecules ?? []);
        // One unambiguous match is the common case — go straight there.
        if ((data.molecules ?? []).length === 1) void loadMolecule(data.molecules[0].id);
      } catch {
        if (seq === requestSeq.current) setHits([]);
      } finally {
        if (seq === requestSeq.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, loadMolecule]);

  // Restore a bookmarked lookup.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const moleculeId = params.get("molecule");
    const q = params.get("q");
    if (q) setQuery(q);
    if (moleculeId) void loadMolecule(moleculeId);
  }, [loadMolecule]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-white">MRL lookup</h1>
        <p className="mt-1 text-zinc-400">
          Search a substance to see its limit in every product and every market at once.
        </p>
      </div>

      <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. chlorpyrifos, tebuconazole, bromide…"
              className="h-12 border-zinc-700 bg-zinc-950 pl-9 text-base"
            />
          </div>

          {searching && <p className="mt-3 text-xs text-zinc-500">Searching…</p>}

          {!searching && query.trim().length >= 2 && hits.length === 0 && (
            <p className="mt-3 text-sm text-zinc-500">
              No substance matches “{query.trim()}”. Check the spelling, or it may not be in the register.
            </p>
          )}

          {hits.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {hits.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => void loadMolecule(h.id)}
                  className={`rounded-md border px-3 py-1.5 text-left text-sm transition-colors ${
                    lookup?.molecule.id === h.id
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                      : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900"
                  }`}
                >
                  {h.name}
                  {h.matchedAlias && <span className="ml-1.5 text-xs text-zinc-500">via “{h.matchedAlias}”</span>}
                  <span className="ml-1.5 text-xs text-zinc-600">{h.limitCount}</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-900/50 bg-zinc-900/50">
          <CardContent className="pt-6 text-sm text-red-400">{error}</CardContent>
        </Card>
      )}

      {lookup && (
        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-white">{lookup.molecule.name}</CardTitle>
            <CardDescription className="text-zinc-400">
              {lookup.molecule.cas_number ? `CAS ${lookup.molecule.cas_number} · ` : ""}
              Limits in mg/kg. <span className="text-zinc-300">*</span> means set at the limit of determination.
              Click a cell for the full record.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-zinc-400">Product</TableHead>
                    {lookup.standards.map((s) => (
                      <TableHead key={s.id} className="text-zinc-400" title={s.name}>
                        {s.code}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lookup.rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={lookup.standards.length + 1} className="text-center text-zinc-500">
                        No product is configured for any market yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {lookup.rows.map((row) => (
                    <TableRow key={row.product.id} className="border-zinc-800">
                      <TableCell className="font-medium text-zinc-200">{row.product.name}</TableCell>
                      {lookup.standards.map((s) => {
                        const cell = row.cells[s.id];
                        const isSelected =
                          selected?.productName === row.product.name && selected?.standard.id === s.id;
                        return (
                          <TableCell key={s.id} className="p-0">
                            <button
                              type="button"
                              title={cellTitle(cell)}
                              onClick={() =>
                                setSelected(
                                  isSelected ? null : { productName: row.product.name, standard: s, cell }
                                )
                              }
                              className={`h-full w-full px-3 py-2 text-left tabular-nums transition-colors hover:bg-zinc-800/60 ${
                                isSelected ? "bg-zinc-800" : ""
                              } ${cellClass(cell)}`}
                            >
                              {cellText(cell)}
                              {cell.state === "LIMIT" && cell.verification_status === "PROXY_UNVERIFIED" && (
                                <span className="ml-1 text-amber-500">⚠</span>
                              )}
                            </button>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {lookup.molecule.aliases.length > 0 && (
              <p className="text-xs text-zinc-500">
                <span className="text-zinc-400">Also matched as:</span> {lookup.molecule.aliases.join(" · ")}
              </p>
            )}

            {selected && <LimitDetail {...selected} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LimitDetail({
  productName,
  standard,
  cell,
}: {
  productName: string;
  standard: Standard;
  cell: Cell;
}) {
  if (cell.state === "NO_PROFILE") {
    return (
      <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-400">
        <p className="font-medium text-zinc-200">
          {productName} · {standard.code}
        </p>
        <p className="mt-1">
          No compliance profile exists for this product and market, so nothing can be judged against it. Create one
          under Settings → Compliance.
        </p>
      </div>
    );
  }

  if (cell.state === "REGIME_DEFAULT") {
    return (
      <div className="rounded-md border border-amber-900/50 bg-amber-500/5 p-4 text-sm">
        <p className="font-medium text-zinc-200">
          {productName} · {standard.code}
        </p>
        <p className="mt-1 flex items-start gap-1.5 text-amber-400/90">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            This substance is not in the {standard.code} table. A result would be judged against the regime default
            of {cell.limit_value} {cell.unit} and flagged — an assumption, not a researched limit.
          </span>
        </p>
      </div>
    );
  }

  const facts: Array<[string, string]> = [
    ["Limit", cell.source_value ? `${cell.source_value} ${cell.unit}` : `${cell.limit_value} ${cell.unit}`],
    ["Kind", cell.limit_kind],
    ["In force since", formatDate(cell.enforcement_date)],
    ["Regulation", cell.regulation_ref || "—"],
    ["Source commodity", cell.source_commodity || "—"],
    ["Register export", formatDate(cell.snapshot_date)],
    [
      "Analytically feasible",
      cell.feasibility === null ? "Unknown" : cell.feasibility ? `Yes${cell.feasibility_note ? ` (${cell.feasibility_note})` : ""}` : "No",
    ],
    [
      "NABL method",
      cell.nabl === null ? "Unknown" : cell.nabl ? `Yes${cell.nabl_note ? ` (${cell.nabl_note})` : ""}` : "No",
    ],
    ["Status", cell.verification_status],
  ];

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-4">
      <p className="text-sm font-medium text-zinc-200">
        {productName} · {standard.code} <span className="text-zinc-500">({standard.name})</span>
      </p>

      {cell.residue_definition && (
        <p className="mt-2 text-xs text-zinc-400">
          <span className="text-zinc-500">The limit is set on:</span> {cell.residue_definition}
          {cell.is_sum_definition && <span className="ml-1 text-amber-400/80">— a sum, not a single molecule</span>}
        </p>
      )}

      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 border-b border-zinc-800/60 pb-1">
            <dt className="text-zinc-500">{label}</dt>
            <dd className="text-right text-zinc-300">{value}</dd>
          </div>
        ))}
      </dl>

      {cell.verification_status === "PROXY_UNVERIFIED" && cell.notes && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-400/90">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{cell.notes}</span>
        </p>
      )}

      {cell.footnotes && (
        <details className="mt-3 text-xs text-zinc-400">
          <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">Register footnotes</summary>
          <p className="mt-1.5 whitespace-pre-line">{cell.footnotes}</p>
        </details>
      )}
    </div>
  );
}
