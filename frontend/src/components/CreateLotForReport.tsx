"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiBaseUrl } from "@/lib/utils";

/**
 * Create the lot and test a report needs, without leaving the mapping screen.
 *
 * A report arrives from the lab carrying its own lot number, product, company
 * and lab name, but cannot be mapped until a Test exists to map it to. Sending
 * people to another screen to retype four values the AI already extracted is
 * the slow half of this workflow.
 *
 * POST /api/tests upserts the Lot and creates the Test in one call, so "create
 * a lot" and "create the test that makes the lot usable" are the same action.
 *
 * send_email is forced FALSE. That endpoint's default is to email the lab a
 * test request — correct when you are commissioning work, wrong here, where
 * the results are already in hand. Sending it would ask the lab to repeat a
 * test they have just delivered.
 */

const API = getApiBaseUrl();

type Named = { id: string; name: string };

/** Best-effort match of an AI-extracted name to a record we hold. */
function guess(options: Named[], text: string | null | undefined): string {
  if (!text) return "";
  const t = text.trim().toLowerCase();
  if (!t) return "";
  const exact = options.find((o) => o.name.toLowerCase() === t);
  if (exact) return exact.id;
  // The lab writes "Eureka Analytical Services Pvt Ltd"; we may hold
  // "Eureka Analytical Services". Accept either containing the other.
  const partial = options.find(
    (o) => t.includes(o.name.toLowerCase()) || o.name.toLowerCase().includes(t)
  );
  return partial?.id ?? "";
}

export function CreateLotForReport({
  reportId,
  lotNumber,
  productName,
  companyName,
  labName,
  onClose,
  onCreated,
}: {
  reportId: string;
  lotNumber: string | null | undefined;
  productName: string | null | undefined;
  companyName: string | null | undefined;
  labName: string | null | undefined;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const [ref, setRef] = useState<{
    products: Named[];
    companies: Named[];
    labs: Named[];
    testTypes: Named[];
  } | null>(null);

  const [lot, setLot] = useState(lotNumber ?? "");
  const [productId, setProductId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [labId, setLabId] = useState("");
  const [testTypeId, setTestTypeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [products, companies, labs, testTypes] = await Promise.all(
          ["products", "companies", "labs", "test-types"].map((p) =>
            fetch(`${API}/settings/${p}`).then((r) => r.json())
          )
        );
        if (cancelled) return;
        const data = { products, companies, labs, testTypes };
        setRef(data);
        // Prefill from what the report already told us.
        setProductId(guess(products, productName));
        setCompanyId(guess(companies, companyName));
        setLabId(guess(labs, labName));
        if (testTypes.length === 1) setTestTypeId(testTypes[0].id);
      } catch {
        if (!cancelled) setError("Could not load products, labs and companies.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productName, companyName, labName]);

  const unmatched = useMemo(() => {
    if (!ref) return [] as string[];
    const out: string[] = [];
    if (productName && !productId) out.push(`product "${productName}"`);
    if (companyName && !companyId) out.push(`company "${companyName}"`);
    if (labName && !labId) out.push(`lab "${labName}"`);
    return out;
  }, [ref, productName, companyName, labName, productId, companyId, labId]);

  const ready = lot.trim() && productId && companyId && labId && testTypeId;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await fetch(`${API}/tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lot_number: lot.trim(),
          product_id: productId,
          company_id: companyId,
          lab_id: labId,
          test_type_id: testTypeId,
          // See the note at the top of this file — never email the lab here.
          send_email: false,
        }),
      });
      const test = await created.json();
      if (!created.ok) throw new Error(test.error || "Could not create the lot and test.");

      // Straight on to the mapping, so the card resolves in one action.
      const mapped = await fetch(`${API}/reviews/${reportId}/map-to-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testId: test.id }),
      });
      const mapResult = await mapped.json().catch(() => ({}));
      if (!mapped.ok) {
        throw new Error(
          `Lot ${lot.trim()} and its test were created, but mapping the report failed: ${
            mapResult.error || mapped.status
          }. Pick the new test from the dropdown.`
        );
      }
      onCreated(`Created lot ${lot.trim()} and mapped the report to its new test.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the lot.");
      setBusy(false);
    }
  };

  const field = (
    label: string,
    value: string,
    setter: (v: string) => void,
    options: Named[],
    hint?: string | null
  ) => (
    <div className="space-y-1">
      <Label className="text-xs text-zinc-400">{label}</Label>
      <select
        value={value}
        onChange={(e) => setter(e.target.value)}
        className="h-9 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100"
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {hint && !value && <p className="text-[11px] text-amber-400/80">Report said “{hint}”</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div className="my-10 w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        <div className="flex items-start justify-between border-b border-zinc-800 p-5">
          <div>
            <h2 className="text-lg font-semibold text-white">Create lot and test</h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              Prefilled from the report. The test is created already complete — no request is sent
              to the lab.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-zinc-500 hover:text-zinc-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 p-5">
          {error && <p className="text-sm text-red-400">{error}</p>}

          {unmatched.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-900/50 bg-amber-500/5 p-3 text-xs text-amber-400/90">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                No match on file for {unmatched.join(", ")}. Pick the right one below, or add it
                under Settings first — guessing here attaches results to the wrong product.
              </span>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs text-zinc-400">Lot number</Label>
            <Input
              value={lot}
              onChange={(e) => setLot(e.target.value)}
              placeholder="e.g. SE/SK/13MT"
              className="border-zinc-700 bg-zinc-950"
            />
            {lotNumber && lot !== lotNumber && (
              <p className="text-[11px] text-zinc-500">Report read “{lotNumber}”</p>
            )}
          </div>

          {!ref ? (
            <p className="text-sm text-zinc-500">Loading products, labs and companies…</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {field("Product", productId, setProductId, ref.products, productName)}
              {field("Company", companyId, setCompanyId, ref.companies, companyName)}
              {field("Lab", labId, setLabId, ref.labs, labName)}
              {field("Test type", testTypeId, setTestTypeId, ref.testTypes, null)}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose} className="text-zinc-400">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!ready || busy}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {busy ? "Creating…" : "Create and map"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
