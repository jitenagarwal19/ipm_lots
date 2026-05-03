"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from "next/link";
import { getApiBaseUrl } from "@/lib/utils";

type NamedEntity = { id: string; name: string };

export default function CreateTestPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [products, setProducts] = useState<NamedEntity[]>([]);
  const [variants, setVariants] = useState<NamedEntity[]>([]);
  const [companies, setCompanies] = useState<NamedEntity[]>([]);
  const [labs, setLabs] = useState<NamedEntity[]>([]);
  const [testTypes, setTestTypes] = useState<NamedEntity[]>([]);
  const [vendors, setVendors] = useState<NamedEntity[]>([]);
  const [staffList, setStaffList] = useState<NamedEntity[]>([]);

  const [selectedProduct, setSelectedProduct] = useState<string>("");
  const [selectedVariant, setSelectedVariant] = useState<string>("none");
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [selectedLab, setSelectedLab] = useState<string>("");
  const [selectedTestType, setSelectedTestType] = useState<string>("");
  const [selectedVendor, setSelectedVendor] = useState<string>("none");
  const [selectedStaff, setSelectedStaff] = useState<string>("none");
  const [region, setRegion] = useState("");
  const [sendEmailToLab, setSendEmailToLab] = useState(true);

  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [staffDialogOpen, setStaffDialogOpen] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [newStaffName, setNewStaffName] = useState("");
  const [savingVendor, setSavingVendor] = useState(false);
  const [savingStaff, setSavingStaff] = useState(false);

  const settingsBase = `${getApiBaseUrl()}/settings`;

  const refreshVendorsAndStaff = async () => {
    const [vRes, sRes] = await Promise.all([
      fetch(`${settingsBase}/vendors`).then((r) => r.json()),
      fetch(`${settingsBase}/staff`).then((r) => r.json()),
    ]);
    setVendors(Array.isArray(vRes) ? vRes : []);
    setStaffList(Array.isArray(sRes) ? sRes : []);
  };

  useEffect(() => {
    const apiBaseUrl = getApiBaseUrl();
    Promise.all([
      fetch(`${apiBaseUrl}/settings/products`).then((r) => r.json()),
      fetch(`${apiBaseUrl}/settings/variants`).then((r) => r.json()),
      fetch(`${apiBaseUrl}/settings/companies`).then((r) => r.json()),
      fetch(`${apiBaseUrl}/settings/labs`).then((r) => r.json()),
      fetch(`${apiBaseUrl}/settings/test-types`).then((r) => r.json()),
      fetch(`${apiBaseUrl}/settings/vendors`).then((r) => r.json()),
      fetch(`${apiBaseUrl}/settings/staff`).then((r) => r.json()),
    ])
      .then(([p, v, c, l, t, ven, stf]) => {
        setProducts(p);
        setVariants(v);
        setCompanies(c);
        setLabs(l);
        setTestTypes(t);
        setVendors(Array.isArray(ven) ? ven : []);
        setStaffList(Array.isArray(stf) ? stf : []);
      })
      .catch((e) => console.error(e));
  }, []);

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingVendor(true);
    try {
      const res = await fetch(`${settingsBase}/vendors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newVendorName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Could not create vendor.");
        return;
      }
      const created: NamedEntity = await res.json();
      await refreshVendorsAndStaff();
      setSelectedVendor(created.id);
      setNewVendorName("");
      setVendorDialogOpen(false);
    } catch (err) {
      console.error(err);
      alert("Network error");
    } finally {
      setSavingVendor(false);
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingStaff(true);
    try {
      const res = await fetch(`${settingsBase}/staff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newStaffName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Could not create staff.");
        return;
      }
      const created: NamedEntity = await res.json();
      await refreshVendorsAndStaff();
      setSelectedStaff(created.id);
      setNewStaffName("");
      setStaffDialogOpen(false);
    } catch (err) {
      console.error(err);
      alert("Network error");
    } finally {
      setSavingStaff(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch(`${getApiBaseUrl()}/tests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lot_number: (document.getElementById("lot_number") as HTMLInputElement).value,
          product_id: selectedProduct,
          variant_id: selectedVariant === "none" ? null : selectedVariant,
          company_id: selectedCompany,
          lab_id: selectedLab,
          test_type_id: selectedTestType,
          send_email: sendEmailToLab,
          vendor_id: selectedVendor === "none" ? null : selectedVendor,
          region: region.trim() || null,
          sampled_by_staff_id: selectedStaff === "none" ? null : selectedStaff,
        }),
      });

      if (res.ok) {
        router.push("/tests");
      } else {
        const err = await res.json();
        alert(`Failed to initiate test: ${err.error}`);
        setIsSubmitting(false);
      }
    } catch (e) {
      console.error(e);
      alert("Network error");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <div>
        <div className="flex items-center gap-4">
          <Link href="/tests" className="text-zinc-400 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </Link>
          <h2 className="text-3xl font-bold tracking-tight text-white">Create Test Request</h2>
        </div>
        <p className="text-zinc-400 mt-2 pl-10">Initiate a new test for a product lot.</p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white">Test Details</CardTitle>
            <CardDescription className="text-zinc-400">Provide the lot details and select the required test parameters.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Label htmlFor="send_email" className="text-zinc-200 cursor-pointer">
                  Send request email to laboratory
                </Label>
                <p className="text-xs text-zinc-500 mt-1">
                  Turn off to save the test only. Status stays Initiated until you contact the lab yourself.
                </p>
              </div>
              <input
                id="send_email"
                type="checkbox"
                checked={sendEmailToLab}
                onChange={(ev) => setSendEmailToLab(ev.target.checked)}
                className="h-5 w-5 rounded border-zinc-600 bg-zinc-900 text-emerald-600 focus:ring-emerald-500 shrink-0"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Lot Number */}
              <div className="space-y-2">
                <Label htmlFor="lot_number" className="text-zinc-200">Lot Number <span className="text-red-500">*</span></Label>
                <Input
                  id="lot_number"
                  placeholder="e.g. LOT-2024-005"
                  required
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500"
                />
              </div>

              {/* Product */}
              <div className="space-y-2">
                <Label className="text-zinc-200">Product <span className="text-red-500">*</span></Label>
                <Select value={selectedProduct} onValueChange={(v) => setSelectedProduct(v ?? "")} required>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-100 focus:ring-emerald-500">
                    <SelectValue placeholder="Select Product">
                      {selectedProduct ? products.find((p) => p.id === selectedProduct)?.name : "Select Product"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Variant */}
              <div className="space-y-2">
                <Label htmlFor="variant" className="text-zinc-200">Variant (Optional)</Label>
                <Select value={selectedVariant} onValueChange={(v) => setSelectedVariant(v ?? "none")}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-100 focus:ring-emerald-500">
                    <SelectValue placeholder="Select Variant">
                      {selectedVariant && selectedVariant !== "none" ? variants.find((v) => v.id === selectedVariant)?.name : "None"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    <SelectItem value="none">None</SelectItem>
                    {variants.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Company */}
              <div className="space-y-2">
                <Label className="text-zinc-200">Company (Exporter) <span className="text-red-500">*</span></Label>
                <Select value={selectedCompany} onValueChange={(v) => setSelectedCompany(v ?? "")} required>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-100 focus:ring-emerald-500">
                    <SelectValue placeholder="Select Exporter">
                      {selectedCompany ? companies.find((c) => c.id === selectedCompany)?.name : "Select Exporter"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-1 md:col-span-2 my-2 border-t border-zinc-800" />

              {/* Vendor */}
              <div className="space-y-2 md:col-span-2">
                <Label className="text-zinc-200">Vendor (Optional)</Label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select value={selectedVendor} onValueChange={(v) => setSelectedVendor(v ?? "none")}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-100 focus:ring-emerald-500 sm:flex-1">
                      <SelectValue placeholder="Select vendor">
                        {selectedVendor === "none" ? "None" : vendors.find((x) => x.id === selectedVendor)?.name}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                      <SelectItem value="none">None</SelectItem>
                      {vendors.map((x) => (
                        <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" className="border-zinc-700 text-zinc-200 shrink-0" onClick={() => setVendorDialogOpen(true)}>
                    New vendor
                  </Button>
                </div>
                <p className="text-xs text-zinc-500">Manage the full list under Settings → Vendors.</p>
              </div>

              {/* Region */}
              <div className="space-y-2">
                <Label htmlFor="region" className="text-zinc-200">Region (Optional)</Label>
                <Input
                  id="region"
                  value={region}
                  onChange={(ev) => setRegion(ev.target.value)}
                  placeholder="e.g. EU, North America"
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500"
                />
              </div>

              {/* Sampled by */}
              <div className="space-y-2">
                <Label className="text-zinc-200">Sampled by (Optional)</Label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select value={selectedStaff} onValueChange={(v) => setSelectedStaff(v ?? "none")}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-100 focus:ring-emerald-500 sm:flex-1">
                      <SelectValue placeholder="Select staff">
                        {selectedStaff === "none" ? "None" : staffList.find((x) => x.id === selectedStaff)?.name}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                      <SelectItem value="none">None</SelectItem>
                      {staffList.map((x) => (
                        <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" className="border-zinc-700 text-zinc-200 shrink-0" onClick={() => setStaffDialogOpen(true)}>
                    New staff
                  </Button>
                </div>
                <p className="text-xs text-zinc-500">Manage the full list under Settings → Staff.</p>
              </div>

              <div className="col-span-1 md:col-span-2 my-2 border-t border-zinc-800" />

              {/* Lab */}
              <div className="space-y-2">
                <Label className="text-zinc-200">Laboratory <span className="text-red-500">*</span></Label>
                <Select value={selectedLab} onValueChange={(v) => setSelectedLab(v ?? "")} required>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-100 focus:ring-emerald-500">
                    <SelectValue placeholder="Select Lab">
                      {selectedLab ? labs.find((l) => l.id === selectedLab)?.name : "Select Lab"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    {labs.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Test Type */}
              <div className="space-y-2">
                <Label className="text-zinc-200">Test Type <span className="text-red-500">*</span></Label>
                <Select value={selectedTestType} onValueChange={(v) => setSelectedTestType(v ?? "")} required>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-100 focus:ring-emerald-500">
                    <SelectValue placeholder="Select Test Type">
                      {selectedTestType ? testTypes.find((t) => t.id === selectedTestType)?.name : "Select Test Type"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    {testTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-4 border-t border-zinc-800 pt-6">
            <Button type="button" variant="ghost" onClick={() => router.push("/tests")} className="text-zinc-400 hover:text-white hover:bg-zinc-800">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-32">
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Initiating...
                </div>
              ) : (
                "Initiate Test"
              )}
            </Button>
          </CardFooter>
        </Card>
      </form>

      <Dialog open={vendorDialogOpen} onOpenChange={setVendorDialogOpen}>
        <DialogContent className="sm:max-w-[400px] bg-zinc-900 border-zinc-800 text-white">
          <form onSubmit={handleCreateVendor}>
            <DialogHeader>
              <DialogTitle>Add vendor</DialogTitle>
              <DialogDescription className="text-zinc-400">
                Creates a vendor you can reuse on this and future tests. Also available under Settings.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="new_vendor_name">Name</Label>
              <Input
                id="new_vendor_name"
                value={newVendorName}
                onChange={(ev) => setNewVendorName(ev.target.value)}
                required
                className="mt-2 bg-zinc-950 border-zinc-700 focus-visible:ring-emerald-500"
                placeholder="Vendor name"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setVendorDialogOpen(false)} className="text-zinc-400">
                Cancel
              </Button>
              <Button type="submit" disabled={savingVendor} className="bg-emerald-600 hover:bg-emerald-700">
                {savingVendor ? "Saving…" : "Save vendor"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={staffDialogOpen} onOpenChange={setStaffDialogOpen}>
        <DialogContent className="sm:max-w-[400px] bg-zinc-900 border-zinc-800 text-white">
          <form onSubmit={handleCreateStaff}>
            <DialogHeader>
              <DialogTitle>Add sampling staff</DialogTitle>
              <DialogDescription className="text-zinc-400">
                Adds a team member who collected the sample. Also available under Settings.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="new_staff_name">Name</Label>
              <Input
                id="new_staff_name"
                value={newStaffName}
                onChange={(ev) => setNewStaffName(ev.target.value)}
                required
                className="mt-2 bg-zinc-950 border-zinc-700 focus-visible:ring-emerald-500"
                placeholder="Staff name"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setStaffDialogOpen(false)} className="text-zinc-400">
                Cancel
              </Button>
              <Button type="submit" disabled={savingStaff} className="bg-emerald-600 hover:bg-emerald-700">
                {savingStaff ? "Saving…" : "Save staff"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
