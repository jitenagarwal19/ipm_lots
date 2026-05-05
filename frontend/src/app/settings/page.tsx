"use client";

import { useCallback, useState, useEffect } from "react";
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
  const [standards, setStandards] = useState<any[]>([]);
  const [profile, setProfile] = useState<any | null>(null);
  const [message, setMessage] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(false);

  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedStandardId, setSelectedStandardId] = useState("");
  const [defaultLimit, setDefaultLimit] = useState("0.01");

  const [newStandardCode, setNewStandardCode] = useState("");
  const [newStandardName, setNewStandardName] = useState("");
  const [newStandardDefault, setNewStandardDefault] = useState("0.01");
  const [isStandardDialogOpen, setIsStandardDialogOpen] = useState(false);

  const [limitEditId, setLimitEditId] = useState<string | null>(null);
  const [limitMoleculeId, setLimitMoleculeId] = useState("");
  const [limitValue, setLimitValue] = useState("");
  const [limitNotes, setLimitNotes] = useState("");
  const [isMoleculeDialogOpen, setIsMoleculeDialogOpen] = useState(false);
  const [newMoleculeName, setNewMoleculeName] = useState("");
  const [newMoleculeCas, setNewMoleculeCas] = useState("");

  const [importing, setImporting] = useState(false);
  const [previewRows, setPreviewRows] = useState<any[]>([]);

  const loadBaseData = async () => {
    const [m, s] = await Promise.all([
      fetch(`${API_BASE_URL}/molecules`).then((r) => r.json()),
      fetch(`${API_BASE_URL}/compliance-standards`).then((r) => r.json()),
    ]);
    setMolecules(m);
    setStandards(s);
  };

  const loadProfile = useCallback(async (productId = selectedProductId, standardId = selectedStandardId) => {
    if (!productId || !standardId) {
      setProfile(null);
      return;
    }
    setLoadingProfile(true);
    setMessage("");
    try {
      const res = await fetch(`${API_BASE_URL}/compliance/profiles?product_id=${encodeURIComponent(productId)}&standard_id=${encodeURIComponent(standardId)}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to load compliance profile.");
      setProfile(payload.profile);
      setPreviewRows([]);
      const selectedStandard = standards.find((s) => s.id === standardId);
      setDefaultLimit(String(payload.profile?.fallback_limit ?? selectedStandard?.fallback_limit ?? "0.01"));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to load compliance profile.");
    } finally {
      setLoadingProfile(false);
    }
  }, [selectedProductId, selectedStandardId, standards]);

  useEffect(() => {
    void loadBaseData();
  }, []);

  useEffect(() => {
    void loadProfile(selectedProductId, selectedStandardId);
  }, [loadProfile, selectedProductId, selectedStandardId]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const selectedStandard = standards.find((s) => s.id === selectedStandardId);

  const resetLimitForm = () => {
    setLimitEditId(null);
    setLimitMoleculeId("");
    setLimitValue("");
    setLimitNotes("");
  };

  const createStandard = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/compliance-standards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: newStandardCode,
          name: newStandardName,
          fallback_limit: newStandardDefault,
          fallback_unit: "mg/kg",
        }),
      });
      const standard = await res.json();
      if (!res.ok) throw new Error(standard.error || "Failed to create regulation.");
      setNewStandardCode("");
      setNewStandardName("");
      setNewStandardDefault("0.01");
      setIsStandardDialogOpen(false);
      await loadBaseData();
      setSelectedStandardId(standard.id);
      setMessage("Regulation saved. Select a product and create its compliance profile.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create regulation.");
    }
  };

  const createProfile = async () => {
    if (!selectedProductId || !selectedStandardId) return;
    try {
      const res = await fetch(`${API_BASE_URL}/compliance/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: selectedProductId,
          standard_id: selectedStandardId,
          fallback_limit: defaultLimit,
          fallback_unit: "mg/kg",
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to create compliance profile.");
      setProfile(payload.profile);
      setDefaultLimit(String(payload.profile.fallback_limit));
      setMessage("Compliance profile created.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create compliance profile.");
    }
  };

  const createMolecule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/molecules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newMoleculeName, cas_number: newMoleculeCas }),
      });
      const molecule = await res.json();
      if (!res.ok) throw new Error(molecule.error || "Failed to save molecule.");
      setMolecules((current) => {
        const withoutDuplicate = current.filter((m) => m.id !== molecule.id);
        return [...withoutDuplicate, molecule].sort((a, b) => a.name.localeCompare(b.name));
      });
      setLimitMoleculeId(molecule.id);
      setNewMoleculeName("");
      setNewMoleculeCas("");
      setIsMoleculeDialogOpen(false);
      setMessage("Molecule saved. Add its limit for this profile.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save molecule.");
    }
  };

  const saveDefault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    try {
      const res = await fetch(`${API_BASE_URL}/compliance/profiles/${profile.id}/default`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fallback_limit: defaultLimit, fallback_unit: "mg/kg" }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to update default.");
      setProfile(payload.profile);
      setMessage("Default limit updated.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update default.");
    }
  };

  const saveLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    try {
      const url = limitEditId
        ? `${API_BASE_URL}/compliance/profiles/${profile.id}/limits/${limitEditId}`
        : `${API_BASE_URL}/compliance/profiles/${profile.id}/limits`;
      const res = await fetch(url, {
        method: limitEditId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          molecule_id: limitMoleculeId,
          limit_value: limitValue,
          unit: "mg/kg",
          notes: limitNotes,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to save molecule limit.");
      setProfile(payload.profile);
      resetLimitForm();
      setMessage("Molecule limit saved.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save molecule limit.");
    }
  };

  const previewCsv = async (file: File | null) => {
    if (!file || !profile) return;
    setImporting(true);
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API_BASE_URL}/compliance/profiles/${profile.id}/import/preview`, { method: "POST", body: form });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "CSV preview failed.");
      setPreviewRows(payload.rows || []);
      setMessage(`Ready to review ${payload.rows?.length || 0} CSV row${payload.rows?.length === 1 ? "" : "s"}.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "CSV preview failed.");
    } finally {
      setImporting(false);
    }
  };

  const updatePreviewRow = (idx: number, patch: Record<string, unknown>) => {
    setPreviewRows((rows) => rows.map((row, rowIdx) => (rowIdx === idx ? { ...row, ...patch } : row)));
  };

  const commitCsv = async () => {
    if (!profile) return;
    try {
      const rows = previewRows.map((row) => ({
        molecule_name: row.molecule_name,
        cas_number: row.cas_number,
        aliases: row.aliases,
        limit_value: row.limit_value,
        unit: "mg/kg",
        notes: row.notes,
        action: row.action,
        molecule_id: row.action === "create_new" ? undefined : (row.molecule_id || row.matched_molecule?.id),
      }));
      const res = await fetch(`${API_BASE_URL}/compliance/profiles/${profile.id}/import/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "CSV import failed.");
      setProfile(payload.profile);
      setPreviewRows([]);
      setMessage(`Imported ${payload.imported || 0} molecule limit${payload.imported === 1 ? "" : "s"}.`);
      await loadBaseData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "CSV import failed.");
    }
  };

  const rowsHaveErrors = previewRows.some((row) => row.errors?.length);
  const csvTemplate = [
    "molecule_name,cas_number,aliases,limit_value,unit,notes",
    "Acephate,,\"Orthene\",0.02,mg/kg,",
    "Atrazine,,\"\",0.01,mg/kg,",
  ].join("\n");

  const downloadCsvTemplate = () => {
    const blob = new Blob([csvTemplate], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "compliance-limits-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {message && <p className="text-sm text-emerald-400">{message}</p>}

      <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-white">Compliance Setup</CardTitle>
          <CardDescription className="text-zinc-400">
            Select the product and regulation pair. Every value in this workflow is stored in mg/kg.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1">
              <Label className="text-xs text-zinc-400">Product</Label>
              <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)} className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100">
                <option value="">Select product</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-zinc-400">Regulation</Label>
                <Button type="button" variant="ghost" size="sm" onClick={() => setIsStandardDialogOpen(true)} className="h-6 px-2 text-xs text-emerald-400 hover:text-emerald-300">
                  + Add regulation
                </Button>
              </div>
              <select value={selectedStandardId} onChange={(e) => setSelectedStandardId(e.target.value)} className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100">
                <option value="">Select regulation</option>
                {standards.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <Button disabled={!selectedProductId || !selectedStandardId || Boolean(profile) || loadingProfile} onClick={createProfile} className="h-10 w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                {loadingProfile ? "Checking..." : profile ? "Profile ready" : "Create profile"}
              </Button>
            </div>
          </div>

          {selectedProduct && selectedStandard && profile && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
              <p className="text-sm text-emerald-100">
                Editing compliance for <span className="font-medium">{selectedProduct.name}</span> under <span className="font-medium">{selectedStandard.name}</span>.
              </p>
              <p className="mt-1 text-xs text-emerald-200/70">Default and molecule-specific limits are managed below.</p>
            </div>
          )}

          {selectedProduct && selectedStandard && !profile && !loadingProfile && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-sm text-amber-100">No compliance profile exists for {selectedProduct.name} + {selectedStandard.name}. Set the default and create it before adding molecules.</p>
              <div className="mt-3 flex max-w-xs gap-2">
                <Input value={defaultLimit} onChange={(e) => setDefaultLimit(e.target.value)} className="bg-zinc-950 border-zinc-700" />
                <span className="flex items-center rounded-md border border-zinc-700 px-3 text-sm text-zinc-300">mg/kg</span>
              </div>
            </div>
          )}

          <Dialog open={isStandardDialogOpen} onOpenChange={setIsStandardDialogOpen}>
            <DialogContent className="sm:max-w-[520px] bg-zinc-900 border-zinc-800 text-white">
              <form onSubmit={createStandard}>
                <DialogHeader>
                  <DialogTitle>Add Regulation</DialogTitle>
                  <DialogDescription className="text-zinc-400">
                    Add Korea, Taiwan, or another regulation once, then pair it with any product.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
                    <div className="space-y-2">
                      <Label htmlFor="reg-code">Code</Label>
                      <Input id="reg-code" value={newStandardCode} onChange={(e) => setNewStandardCode(e.target.value)} placeholder="TW" required className="bg-zinc-950 border-zinc-700" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg-name">Regulation name</Label>
                      <Input id="reg-name" value={newStandardName} onChange={(e) => setNewStandardName(e.target.value)} placeholder="Taiwan MRL" required className="bg-zinc-950 border-zinc-700" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-default">Default limit (mg/kg)</Label>
                    <Input id="reg-default" value={newStandardDefault} onChange={(e) => setNewStandardDefault(e.target.value)} placeholder="0.01" required className="max-w-40 bg-zinc-950 border-zinc-700" />
                    <p className="text-xs text-zinc-500">This is only a starting default. Each product pair can have its own default after you create the profile.</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setIsStandardDialogOpen(false)} className="text-zinc-300">Cancel</Button>
                  <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">Save regulation</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {profile && (
        <>
          <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-white">{profile.product?.name} + {profile.standard?.name}</CardTitle>
              <CardDescription className="text-zinc-400">Default applies to detected molecules without a specific row below.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveDefault} className="flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Default limit</Label>
                  <Input value={defaultLimit} onChange={(e) => setDefaultLimit(e.target.value)} required className="w-40 bg-zinc-950 border-zinc-700" />
                </div>
                <div className="rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-300">mg/kg</div>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">Save default</Button>
              </form>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-white">Molecule Limits</CardTitle>
              <CardDescription className="text-zinc-400">Edit individual molecule limits for this product and regulation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={saveLimit} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_10rem_minmax(14rem,1fr)_auto]">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs text-zinc-400">Molecule</Label>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setIsMoleculeDialogOpen(true)} className="h-6 px-2 text-xs text-emerald-400 hover:text-emerald-300">
                        + New molecule
                      </Button>
                    </div>
                    <select value={limitMoleculeId} onChange={(e) => setLimitMoleculeId(e.target.value)} required className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100">
                      <option value="">Select molecule</option>
                      {molecules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-zinc-400">Limit (mg/kg)</Label>
                    <Input value={limitValue} onChange={(e) => setLimitValue(e.target.value)} placeholder="0.01" required className="bg-zinc-950 border-zinc-700" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-zinc-400">Notes</Label>
                    <Input value={limitNotes} onChange={(e) => setLimitNotes(e.target.value)} placeholder="Optional notes" className="bg-zinc-950 border-zinc-700" />
                  </div>
                  <div className="flex items-end gap-2">
                    <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">{limitEditId ? "Update" : "Add"}</Button>
                    {limitEditId && <Button type="button" variant="ghost" onClick={resetLimitForm} className="text-zinc-300">Cancel</Button>}
                  </div>
                </div>
              </form>

              <Dialog open={isMoleculeDialogOpen} onOpenChange={setIsMoleculeDialogOpen}>
                <DialogContent className="sm:max-w-[425px] bg-zinc-900 border-zinc-800 text-white">
                  <form onSubmit={createMolecule}>
                    <DialogHeader>
                      <DialogTitle>Add Molecule</DialogTitle>
                      <DialogDescription className="text-zinc-400">Create a molecule and use it in this compliance profile.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="new-molecule-name">Molecule name</Label>
                        <Input id="new-molecule-name" value={newMoleculeName} onChange={(e) => setNewMoleculeName(e.target.value)} placeholder="e.g. Imidacloprid" required className="bg-zinc-950 border-zinc-700" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-molecule-cas">CAS number</Label>
                        <Input id="new-molecule-cas" value={newMoleculeCas} onChange={(e) => setNewMoleculeCas(e.target.value)} placeholder="Optional" className="bg-zinc-950 border-zinc-700" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white">Save molecule</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>

              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800">
                    <TableHead className="text-zinc-400">Molecule</TableHead>
                    <TableHead className="text-zinc-400">Limit</TableHead>
                    <TableHead className="text-zinc-400">Notes</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profile.limits?.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-zinc-500">No molecule-specific limits yet. The default limit will apply.</TableCell></TableRow>}
                  {profile.limits?.map((limit: any) => (
                    <TableRow key={limit.id} className="border-zinc-800">
                      <TableCell className="text-zinc-200">{limit.molecule?.name || "-"}</TableCell>
                      <TableCell className="text-zinc-400">{limit.limit_value} mg/kg</TableCell>
                      <TableCell className="text-zinc-400">{limit.notes || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => { setLimitEditId(limit.id); setLimitMoleculeId(limit.molecule_id); setLimitValue(String(limit.limit_value)); setLimitNotes(limit.notes || ""); }} className="text-blue-400">Edit</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-white">CSV Upload And Review</CardTitle>
              <CardDescription className="text-zinc-400">Upload molecule_name, cas_number, aliases, limit_value, unit, and notes. Rows are saved only after review.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-zinc-100">CSV format</h3>
                    <p className="mt-1 text-xs text-zinc-500">Use these exact headers. CAS number is optional and can be left blank. `unit` must be `mg/kg`. Put multiple aliases in one cell separated by `|`.</p>
                  </div>
                  <Button type="button" variant="outline" onClick={downloadCsvTemplate} className="border-zinc-700 text-zinc-200">
                    Download template
                  </Button>
                </div>
                <pre className="mt-3 overflow-x-auto rounded-md border border-zinc-800 bg-black/30 p-3 text-xs text-zinc-300">
{csvTemplate}
                </pre>
              </div>

              <Input type="file" accept=".csv,text/csv" disabled={importing} onChange={(e) => void previewCsv(e.target.files?.[0] ?? null)} className="max-w-md bg-zinc-950 border-zinc-700 text-zinc-200" />

              {previewRows.length > 0 && (
                <div className="space-y-3">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-zinc-800">
                        <TableHead className="text-zinc-400">CSV Molecule</TableHead>
                        <TableHead className="text-zinc-400">Decision</TableHead>
                        <TableHead className="text-zinc-400">Existing Molecule</TableHead>
                        <TableHead className="text-zinc-400">Limit</TableHead>
                        <TableHead className="text-zinc-400">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row, idx) => (
                        <TableRow key={`${row.row_number}-${idx}`} className="border-zinc-800 align-top">
                          <TableCell className="text-zinc-200">
                            <div>{row.molecule_name || "-"}</div>
                            <div className="text-xs text-zinc-500">{row.cas_number || "No CAS"} {row.match_type !== "NEW" ? `matched by ${row.match_type}` : ""}</div>
                          </TableCell>
                          <TableCell>
                            <select value={row.action} onChange={(e) => updatePreviewRow(idx, { action: e.target.value })} className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100">
                              <option value="use_existing">Use match</option>
                              <option value="map_existing">Map to existing</option>
                              <option value="create_new">Create new</option>
                            </select>
                          </TableCell>
                          <TableCell>
                            <select value={row.molecule_id || row.matched_molecule?.id || ""} disabled={row.action === "create_new"} onChange={(e) => updatePreviewRow(idx, { molecule_id: e.target.value, action: "map_existing" })} className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100 disabled:opacity-50">
                              <option value="">Select molecule</option>
                              {molecules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                          </TableCell>
                          <TableCell>
                            <Input value={row.limit_value ?? ""} onChange={(e) => updatePreviewRow(idx, { limit_value: e.target.value })} className="w-28 bg-zinc-950 border-zinc-700" />
                            <div className="text-xs text-zinc-500">mg/kg</div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {row.errors?.length ? (
                              <span className="text-red-300">{row.errors.join(", ")}</span>
                            ) : (
                              <span className="text-emerald-300">{row.confidence === "none" ? "New molecule" : `${row.confidence} confidence`}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Button disabled={rowsHaveErrors} onClick={commitCsv} className="bg-emerald-600 hover:bg-emerald-700 text-white">Confirm CSV import</Button>
                  {rowsHaveErrors && <p className="text-xs text-red-300">Fix the CSV and upload again for rows with validation errors.</p>}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
            <CardHeader>
              <CardTitle className="text-white">Update Logs</CardTitle>
              <CardDescription className="text-zinc-400">Recent changes to this product and regulation pair.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {profile.logs?.length === 0 && <p className="text-sm text-zinc-500">No updates logged yet.</p>}
                {profile.logs?.map((log: any) => (
                  <div key={log.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                    <div className="flex flex-wrap justify-between gap-2">
                      <p className="text-sm font-medium text-zinc-100">{log.message}</p>
                      <p className="text-xs text-zinc-500">{new Date(log.createdAt).toLocaleString()}</p>
                    </div>
                    <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">{log.action}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
