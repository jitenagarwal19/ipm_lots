"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  complianceChecks?: ComplianceCheck[];
};

type ComplianceCheck = {
  id: string;
  status: string;
  is_compliant?: boolean | null;
  checked_at?: string | null;
  standard?: { id: string; code: string; name: string } | null;
};

type ComplianceStandard = {
  id: string;
  code: string;
  name: string;
  fallback_limit: number;
  fallback_unit: string;
};

type CompliancePreviewRow = {
  moleculeResultId: string;
  moleculeName: string;
  casNumber?: string | null;
  result?: string | null;
  measuredValue?: number | null;
  measuredUnit?: string | null;
  limitValue: number;
  limitUnit: string;
  limitSource: string;
  fallbackUsed: boolean;
  isCompliant?: boolean | null;
};

type CompliancePreview = {
  rows: CompliancePreviewRow[];
  existingCheck?: ComplianceCheck | null;
  standard: ComplianceStandard;
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

function boolToSelect(v: boolean | null | undefined): "unset" | "yes" | "no" {
  if (v === true) return "yes";
  if (v === false) return "no";
  return "unset";
}

function selectToBool(v: string): boolean | null {
  if (v === "yes") return true;
  if (v === "no") return false;
  return null;
}

type MoleculeEditDialogProps = {
  reportId: string;
  molecule: MoleculeResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (m: MoleculeResult) => void;
  disabled: boolean;
};

function MoleculeEditDialog({ reportId, molecule, open, onOpenChange, onSaved, disabled }: MoleculeEditDialogProps) {
  const [moleculeName, setMoleculeName] = useState("");
  const [casNumber, setCasNumber] = useState("");
  const [result, setResult] = useState("");
  const [numericResult, setNumericResult] = useState("");
  const [unit, setUnit] = useState("");
  const [reportingLimit, setReportingLimit] = useState("");
  const [methodDetectionLimit, setMethodDetectionLimit] = useState("");
  const [specificationLimit, setSpecificationLimit] = useState("");
  const [method, setMethod] = useState("");
  const [status, setStatus] = useState("");
  const [isDetectedSel, setIsDetectedSel] = useState<"unset" | "yes" | "no">("unset");
  const [isCompliantSel, setIsCompliantSel] = useState<"unset" | "yes" | "no">("unset");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !molecule) return;
    setMoleculeName(molecule.molecule_name || "");
    setCasNumber(molecule.cas_number ?? "");
    setResult(molecule.result ?? "");
    setNumericResult(
      typeof molecule.numeric_result === "number" && Number.isFinite(molecule.numeric_result)
        ? String(molecule.numeric_result)
        : ""
    );
    setUnit(molecule.unit ?? "");
    setReportingLimit(molecule.reporting_limit ?? "");
    setMethodDetectionLimit(molecule.method_detection_limit ?? "");
    setSpecificationLimit(molecule.specification_limit ?? "");
    setMethod(molecule.method ?? "");
    setStatus(molecule.status ?? "");
    setIsDetectedSel(boolToSelect(molecule.is_detected));
    setIsCompliantSel(boolToSelect(molecule.is_compliant));
    setNotes(molecule.notes ?? "");
    setSaveError(null);
  }, [open, molecule]);

  const handleSave = async () => {
    if (!molecule || disabled) return;
    const name = moleculeName.trim();
    if (!name) {
      setSaveError("Molecule name is required.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const numericTrim = numericResult.trim();
      const payload = {
        molecule_name: name,
        cas_number: casNumber.trim() || null,
        result: result.trim() || null,
        numeric_result: numericTrim === "" ? null : Number(numericTrim),
        unit: unit.trim() || null,
        reporting_limit: reportingLimit.trim() || null,
        method_detection_limit: methodDetectionLimit.trim() || null,
        specification_limit: specificationLimit.trim() || null,
        method: method.trim() || null,
        status: status.trim() || null,
        is_detected: selectToBool(isDetectedSel),
        is_compliant: selectToBool(isCompliantSel),
        notes: notes.trim() || null,
      };
      if (payload.numeric_result !== null && !Number.isFinite(payload.numeric_result as number)) {
        setSaveError("Numeric result must be a valid number or empty.");
        setSaving(false);
        return;
      }
      const res = await fetch(`${getApiBaseUrl()}/reviews/${reportId}/molecules/${molecule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save molecule.");
      }
      onSaved(data as MoleculeResult);
      onOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-zinc-800 bg-zinc-950 text-zinc-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">Edit molecule</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Correct AI extraction before approving this report. Changes are saved to this lab report only.
          </DialogDescription>
        </DialogHeader>
        {molecule && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="mol-name" className="text-zinc-300">
                Molecule name
              </Label>
              <Input
                id="mol-name"
                value={moleculeName}
                onChange={(e) => setMoleculeName(e.target.value)}
                disabled={disabled}
                className="border-zinc-700 bg-zinc-900/80 text-zinc-100"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mol-cas" className="text-zinc-300">
                CAS
              </Label>
              <Input
                id="mol-cas"
                value={casNumber}
                onChange={(e) => setCasNumber(e.target.value)}
                disabled={disabled}
                className="border-zinc-700 bg-zinc-900/80 text-zinc-100"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mol-num" className="text-zinc-300">
                Numeric result
              </Label>
              <Input
                id="mol-num"
                value={numericResult}
                onChange={(e) => setNumericResult(e.target.value)}
                disabled={disabled}
                className="border-zinc-700 bg-zinc-900/80 text-zinc-100"
                inputMode="decimal"
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="mol-result" className="text-zinc-300">
                Result (text)
              </Label>
              <Input
                id="mol-result"
                value={result}
                onChange={(e) => setResult(e.target.value)}
                disabled={disabled}
                className="border-zinc-700 bg-zinc-900/80 text-zinc-100"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mol-unit" className="text-zinc-300">
                Unit
              </Label>
              <Input
                id="mol-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                disabled={disabled}
                className="border-zinc-700 bg-zinc-900/80 text-zinc-100"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mol-spec" className="text-zinc-300">
                Specification limit
              </Label>
              <Input
                id="mol-spec"
                value={specificationLimit}
                onChange={(e) => setSpecificationLimit(e.target.value)}
                disabled={disabled}
                className="border-zinc-700 bg-zinc-900/80 text-zinc-100"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mol-rl" className="text-zinc-300">
                Reporting limit
              </Label>
              <Input
                id="mol-rl"
                value={reportingLimit}
                onChange={(e) => setReportingLimit(e.target.value)}
                disabled={disabled}
                className="border-zinc-700 bg-zinc-900/80 text-zinc-100"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mol-mdl" className="text-zinc-300">
                Method detection limit
              </Label>
              <Input
                id="mol-mdl"
                value={methodDetectionLimit}
                onChange={(e) => setMethodDetectionLimit(e.target.value)}
                disabled={disabled}
                className="border-zinc-700 bg-zinc-900/80 text-zinc-100"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Detected</Label>
              <Select value={isDetectedSel} onValueChange={(v) => setIsDetectedSel(v as "unset" | "yes" | "no")} disabled={disabled}>
                <SelectTrigger className="border-zinc-700 bg-zinc-900/80 text-zinc-100">
                  <SelectValue placeholder="Infer from text" />
                </SelectTrigger>
                <SelectContent className="border-zinc-700 bg-zinc-950 text-zinc-100">
                  <SelectItem value="unset">Infer from result / status</SelectItem>
                  <SelectItem value="yes">Yes (detected)</SelectItem>
                  <SelectItem value="no">No (not detected)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Compliant</Label>
              <Select value={isCompliantSel} onValueChange={(v) => setIsCompliantSel(v as "unset" | "yes" | "no")} disabled={disabled}>
                <SelectTrigger className="border-zinc-700 bg-zinc-900/80 text-zinc-100">
                  <SelectValue placeholder="Unknown" />
                </SelectTrigger>
                <SelectContent className="border-zinc-700 bg-zinc-950 text-zinc-100">
                  <SelectItem value="unset">Unknown</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="mol-method" className="text-zinc-300">
                Method
              </Label>
              <Input
                id="mol-method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                disabled={disabled}
                className="border-zinc-700 bg-zinc-900/80 text-zinc-100"
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="mol-status" className="text-zinc-300">
                Status
              </Label>
              <Input
                id="mol-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={disabled}
                className="border-zinc-700 bg-zinc-900/80 text-zinc-100"
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="mol-notes" className="text-zinc-300">
                Notes
              </Label>
              <textarea
                id="mol-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={disabled}
                rows={3}
                className="w-full min-h-[72px] resize-y rounded-lg border border-zinc-700 bg-zinc-900/80 px-2.5 py-2 text-sm text-zinc-100 outline-none focus-visible:border-amber-500/50 focus-visible:ring-2 focus-visible:ring-amber-500/20 disabled:opacity-50"
              />
            </div>
          </div>
        )}
        {saveError && <p className="text-sm text-red-400">{saveError}</p>}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={disabled || saving || !molecule}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ReviewDetailClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<ReviewReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [editingMolecule, setEditingMolecule] = useState<MoleculeResult | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [standards, setStandards] = useState<ComplianceStandard[]>([]);
  const [showCompliance, setShowCompliance] = useState(false);
  const [selectedStandardId, setSelectedStandardId] = useState("");
  const [compliancePreview, setCompliancePreview] = useState<CompliancePreview | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [complianceNotes, setComplianceNotes] = useState("");
  const [recordingCompliance, setRecordingCompliance] = useState(false);

  const canEditMolecules = report ? ["PENDING_REVIEW", "UNMAPPED"].includes(report.status) : false;

  const handleMoleculeSaved = (updated: MoleculeResult) => {
    setReport((prev) => {
      if (!prev) return prev;
      const list = prev.moleculeResults || [];
      return {
        ...prev,
        moleculeResults: list.map((m) => (m.id === updated.id ? updated : m)),
      };
    });
  };

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

  useEffect(() => {
    async function loadStandards() {
      try {
        const res = await fetch(`${getApiBaseUrl()}/settings/compliance-standards`);
        if (!res.ok) return;
        const data = await res.json();
        const active = Array.isArray(data) ? data.filter((s) => s.is_active !== false) : [];
        setStandards(active);
        if (active.length > 0) setSelectedStandardId((prev) => prev || active[0].id);
      } catch (err) {
        console.error(err);
      }
    }

    void loadStandards();
  }, []);

  useEffect(() => {
    if (!showCompliance || !selectedStandardId) return;
    async function loadPreview() {
      setComplianceLoading(true);
      try {
        const res = await fetch(`${getApiBaseUrl()}/reviews/${params.id}/compliance/${selectedStandardId}/preview`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load compliance preview.");
        }
        setCompliancePreview(data);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Failed to load compliance preview.");
      } finally {
        setComplianceLoading(false);
      }
    }

    void loadPreview();
  }, [params.id, selectedStandardId, showCompliance]);

  const completeMoleculeReview = async () => {
    setApproving(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/reviews/${params.id}/complete-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Molecule review completed from report review screen." }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to complete molecule review.");
      }
      setReport((prev) => prev ? { ...prev, status: data.report?.status || "COMPLIANCE_PENDING" } : prev);
      setShowCompliance(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to complete molecule review.");
    } finally {
      setApproving(false);
    }
  };

  const recordCompliance = async () => {
    if (!selectedStandardId) return;
    setRecordingCompliance(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/reviews/${params.id}/compliance/${selectedStandardId}/agree`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: complianceNotes }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to record compliance.");
      }
      setReport((prev) => {
        if (!prev) return prev;
        const checks = prev.complianceChecks || [];
        const next = checks.filter((c) => c.standard?.id !== selectedStandardId && c.id !== data.check?.id);
        return { ...prev, complianceChecks: [data.check, ...next] };
      });
      setComplianceNotes("");
      setShowCompliance(false);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to record compliance.");
    } finally {
      setRecordingCompliance(false);
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
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={completeMoleculeReview}
            disabled={approving || !canEditMolecules}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {approving ? "Completing..." : "Complete molecule review"}
          </Button>
          {["COMPLIANCE_PENDING", "APPROVED"].includes(report.status) && (
            <Button
              type="button"
              onClick={() => setShowCompliance((v) => !v)}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Check country-wise compliant
            </Button>
          )}
        </div>
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
              <CardDescription className="text-zinc-400 text-xs">
                Every molecule/analyte row extracted by AI. Use Edit to fix wrong detection, limits, or text before approval.
              </CardDescription>
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
                      <TableHead className="h-8 py-1.5 px-2 text-zinc-400 font-medium w-[4.5rem] text-right">
                        Edit
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(report.moleculeResults || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-zinc-500 py-6">
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
                          <TableCell className="py-1.5 px-2 text-right">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300 hover:bg-zinc-800"
                              disabled={!canEditMolecules}
                              onClick={() => {
                                setEditingMolecule(molecule);
                                setEditOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {showCompliance && (
            <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-white">Country-wise Compliance</CardTitle>
                <CardDescription className="text-zinc-400">
                  Select a configured standard, compare detected molecules against resolved limits, then record agreement.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="space-y-1.5">
                    <Label className="text-zinc-300">Compliance type</Label>
                    <Select value={selectedStandardId} onValueChange={(value) => setSelectedStandardId(value || "")}>
                      <SelectTrigger className="border-zinc-700 bg-zinc-900/80 text-zinc-100">
                        <SelectValue placeholder="Select standard" />
                      </SelectTrigger>
                      <SelectContent>
                        {standards.map((standard) => (
                          <SelectItem key={standard.id} value={standard.id}>
                            {standard.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="compliance-notes" className="text-zinc-300">Notes</Label>
                    <Input
                      id="compliance-notes"
                      value={complianceNotes}
                      onChange={(e) => setComplianceNotes(e.target.value)}
                      placeholder="Optional review note"
                      className="border-zinc-700 bg-zinc-900/80 text-zinc-100"
                    />
                  </div>
                </div>

                <div className="rounded-md border border-zinc-800 overflow-x-auto">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow className="border-zinc-800 hover:bg-transparent">
                        <TableHead className="text-zinc-400">Molecule</TableHead>
                        <TableHead className="text-zinc-400">Detected result</TableHead>
                        <TableHead className="text-zinc-400">Resolved limit</TableHead>
                        <TableHead className="text-zinc-400">Source</TableHead>
                        <TableHead className="text-zinc-400">Auto check</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {complianceLoading ? (
                        <TableRow><TableCell colSpan={5} className="py-6 text-center text-zinc-500">Loading limits...</TableCell></TableRow>
                      ) : (compliancePreview?.rows.length ?? 0) === 0 ? (
                        <TableRow><TableCell colSpan={5} className="py-6 text-center text-zinc-500">No detected molecules to compare.</TableCell></TableRow>
                      ) : (
                        compliancePreview?.rows.map((row) => (
                          <TableRow key={row.moleculeResultId} className="border-zinc-800">
                            <TableCell className="text-zinc-100">{row.moleculeName}</TableCell>
                            <TableCell className="text-zinc-300">{row.result || row.measuredValue || "-"} {row.measuredUnit || ""}</TableCell>
                            <TableCell className="text-zinc-300">{row.limitValue} {row.limitUnit}</TableCell>
                            <TableCell className="text-zinc-400">{row.fallbackUsed ? "Fallback" : row.limitSource}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={
                                  row.isCompliant === false
                                    ? "border-red-500/30 text-red-400"
                                    : row.isCompliant === true
                                      ? "border-emerald-500/30 text-emerald-400"
                                      : "border-zinc-700 text-zinc-400"
                                }
                              >
                                {row.isCompliant === null || row.isCompliant === undefined ? "Needs review" : row.isCompliant ? "Within limit" : "Over limit"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    {(report.complianceChecks || []).map((check) => (
                      <Badge key={check.id} variant="outline" className="border-emerald-500/30 text-emerald-400">
                        {check.standard?.name || "Standard"}: {check.status}
                      </Badge>
                    ))}
                  </div>
                  <Button
                    type="button"
                    onClick={() => void recordCompliance()}
                    disabled={!selectedStandardId || recordingCompliance || complianceLoading}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    {recordingCompliance ? "Recording..." : "Compliant"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
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

      <MoleculeEditDialog
        reportId={report.id}
        molecule={editingMolecule}
        open={editOpen}
        onOpenChange={(next) => {
          setEditOpen(next);
          if (!next) setEditingMolecule(null);
        }}
        onSaved={handleMoleculeSaved}
        disabled={!canEditMolecules}
      />
    </div>
  );
}
