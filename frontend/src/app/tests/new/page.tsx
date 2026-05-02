"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from "next/link";
import { getApiBaseUrl } from "@/lib/utils";

export default function CreateTestPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [products, setProducts] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [labs, setLabs] = useState<any[]>([]);
  const [testTypes, setTestTypes] = useState<any[]>([]);

  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | null>("none");
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [selectedLab, setSelectedLab] = useState<string | null>(null);
  const [selectedTestType, setSelectedTestType] = useState<string | null>(null);

  useEffect(() => {
    const apiBaseUrl = getApiBaseUrl();
    Promise.all([
      fetch(`${apiBaseUrl}/settings/products`).then(r => r.json()),
      fetch(`${apiBaseUrl}/settings/variants`).then(r => r.json()),
      fetch(`${apiBaseUrl}/settings/companies`).then(r => r.json()),
      fetch(`${apiBaseUrl}/settings/labs`).then(r => r.json()),
      fetch(`${apiBaseUrl}/settings/test-types`).then(r => r.json())
    ]).then(([p, v, c, l, t]) => {
      setProducts(p); setVariants(v); setCompanies(c); setLabs(l); setTestTypes(t);
    }).catch(e => console.error(e));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const res = await fetch(`${getApiBaseUrl()}/tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lot_number: (document.getElementById('lot_number') as HTMLInputElement).value,
          product_id: selectedProduct,
          variant_id: selectedVariant === 'none' ? null : selectedVariant,
          company_id: selectedCompany,
          lab_id: selectedLab,
          test_type_id: selectedTestType
        })
      });

      if (res.ok) {
        router.push('/tests');
      } else {
        const err = await res.json();
        alert(`Failed to initiate test: ${err.error}`);
        setIsSubmitting(false);
      }
    } catch (e) {
      console.error(e);
      alert('Network error');
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
                <Select value={selectedProduct} onValueChange={setSelectedProduct} required>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-100 focus:ring-emerald-500">
                    <SelectValue placeholder="Select Product">
                      {selectedProduct ? products.find(p => p.id === selectedProduct)?.name : "Select Product"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Variant */}
              <div className="space-y-2">
                <Label htmlFor="variant" className="text-zinc-200">Variant (Optional)</Label>
                <Select value={selectedVariant} onValueChange={setSelectedVariant}>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-100 focus:ring-emerald-500">
                    <SelectValue placeholder="Select Variant">
                      {selectedVariant && selectedVariant !== "none" ? variants.find(v => v.id === selectedVariant)?.name : "None"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    <SelectItem value="none">None</SelectItem>
                    {variants.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Company */}
              <div className="space-y-2">
                <Label className="text-zinc-200">Company (Exporter) <span className="text-red-500">*</span></Label>
                <Select value={selectedCompany} onValueChange={setSelectedCompany} required>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-100 focus:ring-emerald-500">
                    <SelectValue placeholder="Select Exporter">
                      {selectedCompany ? companies.find(c => c.id === selectedCompany)?.name : "Select Exporter"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    {companies.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-1 md:col-span-2 my-2 border-t border-zinc-800"></div>

              {/* Lab */}
              <div className="space-y-2">
                <Label className="text-zinc-200">Laboratory <span className="text-red-500">*</span></Label>
                <Select value={selectedLab} onValueChange={setSelectedLab} required>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-100 focus:ring-emerald-500">
                    <SelectValue placeholder="Select Lab">
                      {selectedLab ? labs.find(l => l.id === selectedLab)?.name : "Select Lab"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    {labs.map(l => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Test Type */}
              <div className="space-y-2">
                <Label className="text-zinc-200">Test Type <span className="text-red-500">*</span></Label>
                <Select value={selectedTestType} onValueChange={setSelectedTestType} required>
                  <SelectTrigger className="bg-zinc-950 border-zinc-800 text-zinc-100 focus:ring-emerald-500">
                    <SelectValue placeholder="Select Test Type">
                      {selectedTestType ? testTypes.find(t => t.id === selectedTestType)?.name : "Select Test Type"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    {testTypes.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

            </div>

          </CardContent>
          <CardFooter className="flex justify-end gap-4 border-t border-zinc-800 pt-6">
            <Button type="button" variant="ghost" onClick={() => router.push('/tests')} className="text-zinc-400 hover:text-white hover:bg-zinc-800">
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
    </div>
  );
}
