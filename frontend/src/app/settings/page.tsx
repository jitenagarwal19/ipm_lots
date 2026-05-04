"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getApiBaseUrl } from "@/lib/utils";

const API_BASE_URL = `${getApiBaseUrl()}/settings`;

export default function SettingsPage() {
  const [labs, setLabs] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [testTypes, setTestTypes] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]);

  const [trackedLabels, setTrackedLabels] = useState("");

  const [isLabDialogOpen, setIsLabDialogOpen] = useState(false);
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [isCompanyDialogOpen, setIsCompanyDialogOpen] = useState(false);
  const [isTestTypeDialogOpen, setIsTestTypeDialogOpen] = useState(false);
  const [isVariantDialogOpen, setIsVariantDialogOpen] = useState(false);
  const [isVendorDialogOpen, setIsVendorDialogOpen] = useState(false);
  const [isStaffDialogOpen, setIsStaffDialogOpen] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);

  const [newLabName, setNewLabName] = useState('');
  const [newLabContacts, setNewLabContacts] = useState([{ contact_name: '', email: '', is_primary: true }]);
  const [newName, setNewName] = useState('');
  const [newCountryStandard, setNewCountryStandard] = useState('');

  const fetchData = async () => {
    try {
      const [l, p, c, t, v, ven, stf, s] = await Promise.all([
        fetch(`${API_BASE_URL}/labs`).then(r => r.json()),
        fetch(`${API_BASE_URL}/products`).then(r => r.json()),
        fetch(`${API_BASE_URL}/companies`).then(r => r.json()),
        fetch(`${API_BASE_URL}/test-types`).then(r => r.json()),
        fetch(`${API_BASE_URL}/variants`).then(r => r.json()),
        fetch(`${API_BASE_URL}/vendors`).then(r => r.json()),
        fetch(`${API_BASE_URL}/staff`).then(r => r.json()),
        fetch(`${API_BASE_URL}/system`).then(r => r.json()),
      ]);
      setLabs(l); setProducts(p); setCompanies(c); setTestTypes(t); setVariants(v); setVendors(ven); setStaff(stf);
      setTrackedLabels(s.tracked_email_labels || "");
    } catch (e) {
      console.error("Error fetching settings:", e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openEditDialog = (item: any, type: string, setter: any) => {
    setEditId(item.id);
    if (type === 'lab') {
      setNewLabName(item.name);
      setNewLabContacts(item.contacts && item.contacts.length > 0 ? item.contacts : [{ contact_name: '', email: '', is_primary: true }]);
    } else if (type === 'testtype') {
      setNewName(item.name);
      setNewCountryStandard(item.country_standard || '');
    } else {
      setNewName(item.name);
    }
    setter(true);
  };

  const handlePostOrPut = async (endpoint: string, data: any, closeDialog: (v: boolean) => void) => {
    const isEdit = editId !== null;
    const url = isEdit ? `${API_BASE_URL}/${endpoint}/${editId}` : `${API_BASE_URL}/${endpoint}`;
    try {
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        closeDialog(false);
        setEditId(null);
        setNewName('');
        setNewCountryStandard('');
        setNewLabName('');
        setNewLabContacts([{ contact_name: '', email: '', is_primary: true }]);
        fetchData();
      } else {
        const errorData = await res.json();
        alert(`Failed to save: ${errorData.error || 'Please try again.'}`);
      }
    } catch (e) {
      console.error(e);
      alert("Network error.");
    }
  };

  const handleSaveSystemSetting = async (key: string, value: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/system/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) {
        alert("Failed to save setting");
      } else {
        alert("Configuration saved successfully!");
      }
    } catch (e) {
      console.error(e);
      alert("Network error.");
    }
  };

  const handleAddLab = async (e: React.FormEvent) => {
    e.preventDefault();
    await handlePostOrPut('labs', { name: newLabName, is_active: true, contacts: newLabContacts }, setIsLabDialogOpen);
  };

  const addContactRow = () => {
    setNewLabContacts([...newLabContacts, { contact_name: '', email: '', is_primary: false }]);
  };

  const updateContact = (index: number, field: string, value: string) => {
    const updated = [...newLabContacts];
    (updated[index] as any)[field] = value;
    setNewLabContacts(updated);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-white">Settings</h2>
        <p className="text-zinc-400 mt-2">Manage master data: labs, products, vendors, sampling staff, companies, and test types.</p>
      </div>

      <Tabs defaultValue="labs" className="w-full">
        <TabsList className="bg-zinc-900 border border-zinc-800 p-1 rounded-xl mb-6 flex flex-wrap h-auto">
          <TabsTrigger value="labs" className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-400">Labs</TabsTrigger>
          <TabsTrigger value="products" className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-400">Products</TabsTrigger>
          <TabsTrigger value="variants" className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-400">Variants</TabsTrigger>
          <TabsTrigger value="vendors" className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-400">Vendors</TabsTrigger>
          <TabsTrigger value="staff" className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-400">Staff</TabsTrigger>
          <TabsTrigger value="companies" className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-400">Companies</TabsTrigger>
          <TabsTrigger value="testtypes" className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-400">Test Types</TabsTrigger>
          <TabsTrigger value="compliance" className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-400">Compliance</TabsTrigger>
          <TabsTrigger value="emailtracking" className="rounded-lg data-[state=active]:bg-zinc-800 data-[state=active]:text-emerald-400">Email Tracking</TabsTrigger>
        </TabsList>

        {/* Labs Tab */}
        <TabsContent value="labs" className="mt-0 outline-none">
          <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-white">Laboratories</CardTitle>
                <CardDescription className="text-zinc-400 mt-1">Configured labs where tests are sent.</CardDescription>
              </div>
              <Dialog open={isLabDialogOpen} onOpenChange={(val) => { setIsLabDialogOpen(val); if (!val) setEditId(null); }}>
                <DialogTrigger asChild>
                  <Button onClick={() => { setEditId(null); setNewLabName(''); setNewLabContacts([{ contact_name: '', email: '', is_primary: true }]); }} className="bg-emerald-600 hover:bg-emerald-700 text-white">Add Lab</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px] bg-zinc-900 border-zinc-800 text-white">
                  <form onSubmit={handleAddLab}>
                    <DialogHeader>
                      <DialogTitle>{editId ? 'Edit' : 'Add'} Laboratory</DialogTitle>
                      <DialogDescription className="text-zinc-400">{editId ? 'Modify' : 'Add'} lab configuration.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Lab Name</Label>
                        <Input id="name" value={newLabName} onChange={e => setNewLabName(e.target.value)} placeholder="e.g. Eurofins" required className="bg-zinc-950 border-zinc-700 focus-visible:ring-emerald-500" />
                      </div>
                      
                      <div className="space-y-3 pt-2 max-h-64 overflow-y-auto pr-2">
                        <div className="flex justify-between items-center sticky top-0 bg-zinc-900 z-10 py-1">
                          <Label>Contacts</Label>
                          <Button type="button" variant="outline" size="sm" onClick={addContactRow} className="h-7 text-xs border-zinc-700 text-zinc-300">
                            + Add Contact
                          </Button>
                        </div>
                        {newLabContacts.map((c, idx) => (
                          <div key={idx} className="flex gap-2 items-start bg-zinc-950/50 p-2 rounded border border-zinc-800">
                            <div className="flex-1 space-y-2">
                              <Input placeholder="Contact Name" value={c.contact_name} onChange={(e) => updateContact(idx, 'contact_name', e.target.value)} required className="h-8 bg-zinc-950 border-zinc-700 focus-visible:ring-emerald-500 text-sm" />
                              <Input type="email" placeholder="Email Address" value={c.email} onChange={(e) => updateContact(idx, 'email', e.target.value)} required className="h-8 bg-zinc-950 border-zinc-700 focus-visible:ring-emerald-500 text-sm" />
                            </div>
                            {idx > 0 && (
                              <Button type="button" variant="ghost" size="sm" onClick={() => setNewLabContacts(newLabContacts.filter((_, i) => i !== idx))} className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-400/10">
                                &times;
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">Save changes</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-zinc-400">Name</TableHead>
                    <TableHead className="text-zinc-400">Contacts</TableHead>
                    <TableHead className="text-zinc-400 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {labs.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-zinc-500">No labs found.</TableCell></TableRow>}
                  {labs.map((lab: any) => (
                    <TableRow key={lab.id} className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                      <TableCell className="font-medium text-zinc-200">{lab.name}</TableCell>
                      <TableCell className="text-zinc-400 text-sm">
                        {lab.contacts?.map((c: any) => (
                          <div key={c.id}>{c.contact_name} ({c.email})</div>
                        ))}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(lab, 'lab', setIsLabDialogOpen)} className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10">Edit</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Generic Tabs content for simple entities */}
        {[
          { key: 'products', title: 'Products', singular: 'Product', desc: 'Manage your spice inventory types.', data: products, setter: setIsProductDialogOpen, isOpen: isProductDialogOpen, endpoint: 'products', type: 'product' },
          { key: 'variants', title: 'Variants', singular: 'Variant', desc: 'Manage product variants.', data: variants, setter: setIsVariantDialogOpen, isOpen: isVariantDialogOpen, endpoint: 'variants', type: 'variant' },
          { key: 'vendors', title: 'Vendors', singular: 'Vendor', desc: 'Suppliers and vendors referenced on test requests.', data: vendors, setter: setIsVendorDialogOpen, isOpen: isVendorDialogOpen, endpoint: 'vendors', type: 'vendor' },
          { key: 'staff', title: 'Sampling staff', singular: 'Staff member', desc: 'People who collect samples (shown on test requests).', data: staff, setter: setIsStaffDialogOpen, isOpen: isStaffDialogOpen, endpoint: 'staff', type: 'staff' },
          { key: 'companies', title: 'Companies', singular: 'Company', desc: 'Internal companies / exporters.', data: companies, setter: setIsCompanyDialogOpen, isOpen: isCompanyDialogOpen, endpoint: 'companies', type: 'company' },
        ].map(tab => (
          <TabsContent key={tab.key} value={tab.key} className="mt-0 outline-none">
            <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-white">{tab.title}</CardTitle>
                  <CardDescription className="text-zinc-400 mt-1">{tab.desc}</CardDescription>
                </div>
                <Dialog open={tab.isOpen} onOpenChange={(val) => { tab.setter(val); if (!val) setEditId(null); }}>
                  <DialogTrigger asChild>
                    <Button onClick={() => { setEditId(null); setNewName(''); }} className="bg-emerald-600 hover:bg-emerald-700 text-white">Add {tab.singular}</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px] bg-zinc-900 border-zinc-800 text-white">
                    <form onSubmit={(e) => { e.preventDefault(); handlePostOrPut(tab.endpoint, { name: newName }, tab.setter); }}>
                      <DialogHeader>
                        <DialogTitle>{editId ? 'Edit' : 'Add'} {tab.singular}</DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="name">Name</Label>
                          <Input id="name" value={newName} onChange={e => setNewName(e.target.value)} required className="bg-zinc-950 border-zinc-700 focus-visible:ring-emerald-500" />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">Save</Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead className="text-zinc-400">Name</TableHead>
                      <TableHead className="text-zinc-400 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tab.data.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-zinc-500 py-4">No data found.</TableCell></TableRow>}
                    {tab.data.map((item: any) => (
                      <TableRow key={item.id} className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                        <TableCell className="font-medium text-zinc-200">{item.name}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(item, tab.type, tab.setter)} className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10">Edit</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        ))}

        {/* Test Types Tab */}
        <TabsContent value="testtypes" className="mt-0 outline-none">
          <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-white">Test Types</CardTitle>
                <CardDescription className="text-zinc-400 mt-1">Defined tests and country standards.</CardDescription>
              </div>
              <Dialog open={isTestTypeDialogOpen} onOpenChange={(val) => { setIsTestTypeDialogOpen(val); if (!val) setEditId(null); }}>
                <DialogTrigger asChild>
                  <Button onClick={() => { setEditId(null); setNewName(''); setNewCountryStandard(''); }} className="bg-emerald-600 hover:bg-emerald-700 text-white">Add Test Type</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px] bg-zinc-900 border-zinc-800 text-white">
                  <form onSubmit={(e) => { e.preventDefault(); handlePostOrPut('test-types', { name: newName, country_standard: newCountryStandard }, setIsTestTypeDialogOpen); }}>
                    <DialogHeader>
                      <DialogTitle>{editId ? 'Edit' : 'Add'} Test Type</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="ttname">Name</Label>
                        <Input id="ttname" value={newName} onChange={e => setNewName(e.target.value)} required className="bg-zinc-950 border-zinc-700 focus-visible:ring-emerald-500" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ttcs">Country Standard</Label>
                        <Input id="ttcs" value={newCountryStandard} onChange={e => setNewCountryStandard(e.target.value)} placeholder="e.g. EU, USA" className="bg-zinc-950 border-zinc-700 focus-visible:ring-emerald-500" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">Save</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-zinc-400">Test Name</TableHead>
                    <TableHead className="text-zinc-400">Country Standard</TableHead>
                    <TableHead className="text-zinc-400 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {testTypes.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-zinc-500 py-4">No data found.</TableCell></TableRow>}
                  {testTypes.map((t: any) => (
                    <TableRow key={t.id} className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                      <TableCell className="font-medium text-zinc-200">{t.name}</TableCell>
                      <TableCell className="text-zinc-400">{t.country_standard || '-'}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(t, 'testtype', setIsTestTypeDialogOpen)} className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10">Edit</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="mt-0 outline-none">
          <ComplianceSettings products={products} />
        </TabsContent>

        {/* Email Tracking Settings */}
        <TabsContent value="emailtracking" className="mt-0 outline-none">
          <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl max-w-2xl">
            <CardHeader>
              <CardTitle className="text-white">Email Tracking</CardTitle>
              <CardDescription className="text-zinc-400 mt-1">Configure which email labels the system should track when polling or receiving webhooks.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => { e.preventDefault(); handleSaveSystemSetting('tracked_email_labels', trackedLabels); }}>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="labels" className="text-zinc-300">Labels to Track</Label>
                    <Input 
                      id="labels" 
                      value={trackedLabels} 
                      onChange={e => setTrackedLabels(e.target.value)} 
                      placeholder="e.g. INBOX, IPM_Report" 
                      className="bg-zinc-950 border-zinc-700 focus-visible:ring-emerald-500 text-white" 
                    />
                    <p className="text-xs text-zinc-500">Comma-separated list of Gmail labels.</p>
                  </div>
                  <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">Save Configuration</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}

function ComplianceSettings({ products }: { products: any[] }) {
  const [molecules, setMolecules] = useState<any[]>([]);
  const [aliases, setAliases] = useState<any[]>([]);
  const [standards, setStandards] = useState<any[]>([]);
  const [limits, setLimits] = useState<any[]>([]);
  const [message, setMessage] = useState("");

  const [moleculeEditId, setMoleculeEditId] = useState<string | null>(null);
  const [moleculeName, setMoleculeName] = useState("");
  const [moleculeCas, setMoleculeCas] = useState("");

  const [aliasEditId, setAliasEditId] = useState<string | null>(null);
  const [aliasMoleculeId, setAliasMoleculeId] = useState("");
  const [aliasName, setAliasName] = useState("");
  const [aliasSource, setAliasSource] = useState("");

  const [standardEditId, setStandardEditId] = useState<string | null>(null);
  const [standardCode, setStandardCode] = useState("");
  const [standardName, setStandardName] = useState("");
  const [fallbackLimit, setFallbackLimit] = useState("0.01");
  const [fallbackUnit, setFallbackUnit] = useState("mg/kg");

  const [limitEditId, setLimitEditId] = useState<string | null>(null);
  const [limitStandardId, setLimitStandardId] = useState("");
  const [limitMoleculeId, setLimitMoleculeId] = useState("");
  const [limitProductId, setLimitProductId] = useState("");
  const [limitValue, setLimitValue] = useState("");
  const [limitUnit, setLimitUnit] = useState("mg/kg");
  const [limitNotes, setLimitNotes] = useState("");
  const [importing, setImporting] = useState(false);

  const loadCompliance = async () => {
    const [m, a, s, l] = await Promise.all([
      fetch(`${API_BASE_URL}/molecules`).then((r) => r.json()),
      fetch(`${API_BASE_URL}/molecule-aliases`).then((r) => r.json()),
      fetch(`${API_BASE_URL}/compliance-standards`).then((r) => r.json()),
      fetch(`${API_BASE_URL}/compliance-limits`).then((r) => r.json()),
    ]);
    setMolecules(m);
    setAliases(a);
    setStandards(s);
    setLimits(l);
  };

  useEffect(() => {
    void loadCompliance();
  }, []);

  async function saveJson(endpoint: string, editId: string | null, data: Record<string, unknown>, onDone: () => void) {
    const res = await fetch(`${API_BASE_URL}/${endpoint}${editId ? `/${editId}` : ""}`, {
      method: editId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const payload = await res.json();
    if (!res.ok) {
      throw new Error(payload.error || "Failed to save.");
    }
    onDone();
    await loadCompliance();
    setMessage("Saved.");
  }

  const resetMolecule = () => {
    setMoleculeEditId(null);
    setMoleculeName("");
    setMoleculeCas("");
  };

  const resetAlias = () => {
    setAliasEditId(null);
    setAliasMoleculeId("");
    setAliasName("");
    setAliasSource("");
  };

  const resetStandard = () => {
    setStandardEditId(null);
    setStandardCode("");
    setStandardName("");
    setFallbackLimit("0.01");
    setFallbackUnit("mg/kg");
  };

  const resetLimit = () => {
    setLimitEditId(null);
    setLimitStandardId("");
    setLimitMoleculeId("");
    setLimitProductId("");
    setLimitValue("");
    setLimitUnit("mg/kg");
    setLimitNotes("");
  };

  const handleImport = async (file: File | null) => {
    if (!file) return;
    setImporting(true);
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_BASE_URL}/compliance-limits/import`, { method: "POST", body: form });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Import failed.");
      await loadCompliance();
      setMessage(`Imported ${payload.imported || 0} limit rows${payload.errors?.length ? ` with ${payload.errors.length} skipped rows` : ""}.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {message && <p className="text-sm text-emerald-400">{message}</p>}

      <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-white">CSV Import</CardTitle>
          <CardDescription className="text-zinc-400">
            Upload columns like standard_code, standard_name, molecule_name, aliases, product_name, limit_value, unit, fallback_limit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            type="file"
            accept=".csv,text/csv"
            disabled={importing}
            onChange={(e) => void handleImport(e.target.files?.[0] ?? null)}
            className="max-w-md bg-zinc-950 border-zinc-700 text-zinc-200"
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white">Molecules</CardTitle>
            <CardDescription className="text-zinc-400">Canonical molecule master data used for all standards.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="grid gap-3 sm:grid-cols-[1fr_10rem_auto]"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await saveJson("molecules", moleculeEditId, { name: moleculeName, cas_number: moleculeCas }, resetMolecule);
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Failed to save molecule.");
                }
              }}
            >
              <Input value={moleculeName} onChange={(e) => setMoleculeName(e.target.value)} placeholder="Molecule name" required className="bg-zinc-950 border-zinc-700" />
              <Input value={moleculeCas} onChange={(e) => setMoleculeCas(e.target.value)} placeholder="CAS number" className="bg-zinc-950 border-zinc-700" />
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">{moleculeEditId ? "Update" : "Add"}</Button>
            </form>
            <Table>
              <TableHeader><TableRow className="border-zinc-800"><TableHead className="text-zinc-400">Name</TableHead><TableHead className="text-zinc-400">CAS</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {molecules.slice(0, 8).map((m) => (
                  <TableRow key={m.id} className="border-zinc-800">
                    <TableCell className="text-zinc-200">{m.name}</TableCell>
                    <TableCell className="text-zinc-400">{m.cas_number || "-"}</TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => { setMoleculeEditId(m.id); setMoleculeName(m.name); setMoleculeCas(m.cas_number || ""); }} className="text-blue-400">Edit</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white">Alternative Names</CardTitle>
            <CardDescription className="text-zinc-400">Map lab-specific names back to a canonical molecule.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem_auto]"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await saveJson("molecule-aliases", aliasEditId, { molecule_id: aliasMoleculeId, alias: aliasName, source: aliasSource }, resetAlias);
                } catch (err) {
                  alert(err instanceof Error ? err.message : "Failed to save alias.");
                }
              }}
            >
              <select value={aliasMoleculeId} onChange={(e) => setAliasMoleculeId(e.target.value)} required className="rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100">
                <option value="">Molecule</option>
                {molecules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <Input value={aliasName} onChange={(e) => setAliasName(e.target.value)} placeholder="Alias" required className="bg-zinc-950 border-zinc-700" />
              <Input value={aliasSource} onChange={(e) => setAliasSource(e.target.value)} placeholder="Source" className="bg-zinc-950 border-zinc-700" />
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">{aliasEditId ? "Update" : "Add"}</Button>
            </form>
            <Table>
              <TableHeader><TableRow className="border-zinc-800"><TableHead className="text-zinc-400">Alias</TableHead><TableHead className="text-zinc-400">Molecule</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {aliases.slice(0, 8).map((a) => (
                  <TableRow key={a.id} className="border-zinc-800">
                    <TableCell className="text-zinc-200">{a.alias}</TableCell>
                    <TableCell className="text-zinc-400">{a.molecule?.name || "-"}</TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => { setAliasEditId(a.id); setAliasMoleculeId(a.molecule_id); setAliasName(a.alias); setAliasSource(a.source || ""); }} className="text-blue-400">Edit</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-white">Compliance Standards</CardTitle>
          <CardDescription className="text-zinc-400">Configured dropdown options and fallback limits.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="grid gap-3 md:grid-cols-[8rem_1fr_8rem_8rem_auto]"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await saveJson("compliance-standards", standardEditId, { code: standardCode, name: standardName, fallback_limit: fallbackLimit, fallback_unit: fallbackUnit }, resetStandard);
              } catch (err) {
                alert(err instanceof Error ? err.message : "Failed to save standard.");
              }
            }}
          >
            <Input value={standardCode} onChange={(e) => setStandardCode(e.target.value)} placeholder="Code" required className="bg-zinc-950 border-zinc-700" />
            <Input value={standardName} onChange={(e) => setStandardName(e.target.value)} placeholder="Display name" required className="bg-zinc-950 border-zinc-700" />
            <Input value={fallbackLimit} onChange={(e) => setFallbackLimit(e.target.value)} placeholder="0.01" required className="bg-zinc-950 border-zinc-700" />
            <Input value={fallbackUnit} onChange={(e) => setFallbackUnit(e.target.value)} placeholder="mg/kg" required className="bg-zinc-950 border-zinc-700" />
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">{standardEditId ? "Update" : "Add"}</Button>
          </form>
          <Table>
            <TableHeader><TableRow className="border-zinc-800"><TableHead className="text-zinc-400">Code</TableHead><TableHead className="text-zinc-400">Name</TableHead><TableHead className="text-zinc-400">Fallback</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {standards.map((s) => (
                <TableRow key={s.id} className="border-zinc-800">
                  <TableCell className="text-zinc-200">{s.code}</TableCell>
                  <TableCell className="text-zinc-200">{s.name}</TableCell>
                  <TableCell className="text-zinc-400">{s.fallback_limit} {s.fallback_unit}</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => { setStandardEditId(s.id); setStandardCode(s.code); setStandardName(s.name); setFallbackLimit(String(s.fallback_limit)); setFallbackUnit(s.fallback_unit); }} className="text-blue-400">Edit</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-white">Compliance Limits</CardTitle>
          <CardDescription className="text-zinc-400">Product blank means the limit applies to all products for that standard.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_7rem_7rem_1fr_auto]"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await saveJson("compliance-limits", limitEditId, { standard_id: limitStandardId, molecule_id: limitMoleculeId, product_id: limitProductId, limit_value: limitValue, unit: limitUnit, notes: limitNotes }, resetLimit);
              } catch (err) {
                alert(err instanceof Error ? err.message : "Failed to save limit.");
              }
            }}
          >
            <select value={limitStandardId} onChange={(e) => setLimitStandardId(e.target.value)} required className="rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"><option value="">Standard</option>{standards.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <select value={limitMoleculeId} onChange={(e) => setLimitMoleculeId(e.target.value)} required className="rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"><option value="">Molecule</option>{molecules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            <select value={limitProductId} onChange={(e) => setLimitProductId(e.target.value)} className="rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"><option value="">All products</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <Input value={limitValue} onChange={(e) => setLimitValue(e.target.value)} placeholder="Limit" required className="bg-zinc-950 border-zinc-700" />
            <Input value={limitUnit} onChange={(e) => setLimitUnit(e.target.value)} placeholder="Unit" required className="bg-zinc-950 border-zinc-700" />
            <Input value={limitNotes} onChange={(e) => setLimitNotes(e.target.value)} placeholder="Notes" className="bg-zinc-950 border-zinc-700" />
            <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">{limitEditId ? "Update" : "Add"}</Button>
          </form>
          <Table>
            <TableHeader><TableRow className="border-zinc-800"><TableHead className="text-zinc-400">Standard</TableHead><TableHead className="text-zinc-400">Molecule</TableHead><TableHead className="text-zinc-400">Product</TableHead><TableHead className="text-zinc-400">Limit</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {limits.slice(0, 20).map((l) => (
                <TableRow key={l.id} className="border-zinc-800">
                  <TableCell className="text-zinc-200">{l.standard?.name || "-"}</TableCell>
                  <TableCell className="text-zinc-200">{l.molecule?.name || "-"}</TableCell>
                  <TableCell className="text-zinc-400">{l.product?.name || "All products"}</TableCell>
                  <TableCell className="text-zinc-400">{l.limit_value} {l.unit}</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => { setLimitEditId(l.id); setLimitStandardId(l.standard_id); setLimitMoleculeId(l.molecule_id); setLimitProductId(l.product_id || ""); setLimitValue(String(l.limit_value)); setLimitUnit(l.unit); setLimitNotes(l.notes || ""); }} className="text-blue-400">Edit</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
