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
