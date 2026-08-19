"use client";

import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getApiBaseUrl } from "@/lib/utils";

/**
 * Clone another profile's limits into this one, with a staging step.
 *
 * Nothing is written until Save. The staged rows are held in the browser, so an
 * abandoned clone leaves no trace — which matters when the alternative is a
 * half-corrected regulatory table sitting in the database.
 *
 * Conflicts sort to the top because they are the only rows that need a decision;
 * everything else defaults to "create" and can be skimmed.
 */

const API = `${getApiBaseUrl()}/settings/compliance/clone`;
const ROWS_SHOWN = 80;

type Row = {
  source_limit_id: string;
  molecule_id: string;
  molecule_name: string;
  residue_definition: string | null;
  limit_value: number;
  limit_kind: string;
  source_value: string | null;
  regulation_ref: string | null;
  enforcement_date: string | null;
  applies_to: string | null;
  source_commodity: string | null;
  nabl: boolean | null;
  feasibility: boolean | null;
  is_sum_definition: boolean;
  footnotes: string | null;
  conflict: boolean;
  existing: { limit_value: number; limit_kind: string; verification_status: string } | null;
  action: "create" | "skip" | "replace";
};

type Preview = {
  source: { id: string; label: string; count: number };
  target: { id: string; label: string; count: number };
  crossRegime: boolean;
  crossProduct: boolean;
  rows: Row[];
};

type Source = { id: string; label: string; count: number };

function limitText(kind: string, value: number) {
  if (kind === "NOT_REQUIRED") return "No MRL required";
  if (kind === "PROHIBITED") return "Must not be detected";
  if (kind === "AT_LOD") return `${value} *`;
  return String(value);
}

export function CloneProfileDialog({
  targetProfileId,
  targetLabel,
  onClose,
  onSaved,
}: {
  targetProfileId: string;
  targetLabel: string;
  onClose: () => void;
  onSaved: (summary: string) => void;
}) {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSources = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${API}/sources`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not list profiles.");
      setSources((data.sources ?? data.profiles ?? []).filter((s: Source) => s.id !== targetProfileId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not list profiles.");
    }
  }, [targetProfileId]);

  if (sources === null && !error) void loadSources();

  const startPreview = async (sourceId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_profile_id: sourceId, target_profile_id: targetProfileId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not build the preview.");
      setPreview(data);
      setRows(data.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the preview.");
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => {
    let create = 0, replace = 0, skip = 0, conflicts = 0;
    for (const r of rows) {
      if (r.conflict) conflicts++;
      if (r.action === "create") create++;
      else if (r.action === "replace") replace++;
      else skip++;
    }
    return { create, replace, skip, conflicts };
  }, [rows]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const matched = q
      ? rows.filter((r) => `${r.molecule_name} ${r.residue_definition ?? ""}`.toLowerCase().includes(q))
      : rows;
    return { matched, shown: matched.slice(0, ROWS_SHOWN) };
  }, [rows, filter]);

  const update = (id: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.source_limit_id === id ? { ...r, ...patch } : r)));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_profile_id: targetProfileId,
          source_profile_id: preview!.source.id,
          rows: rows.filter((r) => r.action !== "skip"),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed.");
      onSaved(`Cloned ${data.created} new and replaced ${data.replaced} in ${targetLabel}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-5xl rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        <div className="flex items-start justify-between border-b border-zinc-800 p-5">
          <div>
            <h2 className="text-lg font-semibold text-white">Clone limits into {targetLabel}</h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              {preview
                ? `${preview.source.label} → ${preview.target.label}`
                : "Pick a profile to copy from. Nothing is saved until you press Save."}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-zinc-500 hover:text-zinc-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

          {/* ── step 1: choose a source */}
          {!preview && (
            <div className="space-y-2">
              {sources === null && <p className="text-sm text-zinc-500">Loading profiles…</p>}
              {sources?.length === 0 && (
                <p className="text-sm text-zinc-500">No other profile has any limits to copy.</p>
              )}
              {sources?.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy}
                  onClick={() => startPreview(s.id)}
                  className="flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-left transition-colors hover:border-zinc-600 hover:bg-zinc-900 disabled:opacity-50"
                >
                  <span className="text-sm font-medium text-zinc-200">{s.label}</span>
                  <span className="text-xs text-zinc-500">{s.count} limits</span>
                </button>
              ))}
            </div>
          )}

          {/* ── step 2: staging */}
          {preview && (
            <>
              {(preview.crossRegime || preview.crossProduct) && (
                <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-900/50 bg-amber-500/5 p-3 text-xs text-amber-400/90">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {preview.crossRegime && preview.crossProduct
                      ? "Different commodity and different regime."
                      : preview.crossRegime
                        ? "Different regulatory regime."
                        : "Different commodity."}{" "}
                    These limits are independent regulatory facts — a value that is right for{" "}
                    {preview.source.label} is not evidence about {preview.target.label}. Every row is saved as{" "}
                    <b>COPIED_UNVERIFIED</b> and keeps the source&apos;s citations, labelled as inherited, until
                    someone checks them against the real register.
                  </span>
                </div>
              )}

              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter by molecule…"
                  className="max-w-xs border-zinc-700 bg-zinc-950"
                />
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                  <span className="text-emerald-400">{counts.create} to create</span>
                  {counts.replace > 0 && <span className="text-blue-400">{counts.replace} to replace</span>}
                  <span className="text-zinc-500">{counts.skip} skipped</span>
                  {counts.conflicts > 0 && (
                    <span className="text-amber-400">{counts.conflicts} already exist</span>
                  )}
                </div>
              </div>

              <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-zinc-800">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-zinc-900">
                    <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                      <th className="w-[38%] px-3 py-2 font-medium">Molecule</th>
                      <th className="px-3 py-2 font-medium">Limit (mg/kg)</th>
                      <th className="px-3 py-2 font-medium">Action</th>
                      <th className="w-px px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.shown.map((r) => (
                      <tr
                        key={r.source_limit_id}
                        className={`border-b border-zinc-800/60 ${r.action === "skip" ? "opacity-40" : ""}`}
                      >
                        <td className="max-w-0 px-3 py-1.5" title={r.residue_definition || r.molecule_name}>
                          <span className="block truncate text-zinc-200">{r.molecule_name}</span>
                          {r.conflict && r.existing && (
                            <span className="text-[11px] text-amber-500/80">
                              already here: {limitText(r.existing.limit_kind, r.existing.limit_value)}
                              {r.existing.verification_status === "VERIFIED" && " · VERIFIED"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          {r.limit_kind === "VALUE" || r.limit_kind === "AT_LOD" ? (
                            <input
                              value={r.limit_value}
                              onChange={(e) =>
                                update(r.source_limit_id, { limit_value: Number(e.target.value) })
                              }
                              inputMode="decimal"
                              className="w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm tabular-nums text-zinc-100 outline-none focus:border-emerald-500"
                            />
                          ) : (
                            <span className="text-xs text-zinc-500">{limitText(r.limit_kind, r.limit_value)}</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          {r.conflict ? (
                            <select
                              value={r.action}
                              onChange={(e) => update(r.source_limit_id, { action: e.target.value as Row["action"] })}
                              className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
                            >
                              <option value="skip">Keep existing</option>
                              <option value="replace">Replace with clone</option>
                            </select>
                          ) : (
                            <span className="text-xs text-emerald-400">Create</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <button
                            type="button"
                            title={r.action === "skip" ? "Include this row" : "Leave this row out"}
                            onClick={() =>
                              update(r.source_limit_id, {
                                action: r.action === "skip" ? (r.conflict ? "replace" : "create") : "skip",
                              })
                            }
                            className="text-zinc-600 hover:text-zinc-300"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visible.matched.length > visible.shown.length && (
                  <p className="py-2 text-center text-xs text-zinc-500">
                    Showing {visible.shown.length} of {visible.matched.length}. Filter to narrow it down — every
                    row is still saved, shown or not.
                  </p>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <Button variant="ghost" onClick={() => { setPreview(null); setRows([]); }} className="text-zinc-400">
                  Choose a different source
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={onClose} className="text-zinc-400">Cancel</Button>
                  <Button
                    onClick={save}
                    disabled={busy || counts.create + counts.replace === 0}
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    {busy ? "Saving…" : `Save ${counts.create + counts.replace} limits`}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
