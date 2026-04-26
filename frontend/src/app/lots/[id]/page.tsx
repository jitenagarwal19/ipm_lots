"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function LotViewPage() {
  // Mock Data
  const lot = {
    lot_number: "LOT-2024-001",
    product: "Black Pepper",
    company: "Suman Exports",
    created_at: "2024-04-20",
    tests: [
      { id: "t1", type: "Pesticide Residue", lab: "Eurofins", status: "AWAITING_REPORT" },
      { id: "t2", type: "Aflatoxin", lab: "SGS Lab", status: "COMPLETED" },
    ],
    emails: [
      { id: "e1", subject: "SGS Lab Results - LOT-2024-001", received_at: "2024-04-22", attachments: 1 }
    ]
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <div>
        <div className="flex items-center gap-4">
          <h2 className="text-3xl font-bold tracking-tight text-white">{lot.lot_number}</h2>
          <Badge className="bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20">{lot.product}</Badge>
        </div>
        <p className="text-zinc-400 mt-2">Exporter: {lot.company} | Created: {lot.created_at}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white">Tests for this Lot</CardTitle>
            <CardDescription className="text-zinc-400">All requested and completed tests.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Type</TableHead>
                  <TableHead className="text-zinc-400">Lab</TableHead>
                  <TableHead className="text-zinc-400">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lot.tests.map(t => (
                  <TableRow key={t.id} className="border-zinc-800 hover:bg-zinc-800/50">
                    <TableCell className="font-medium text-zinc-200">{t.type}</TableCell>
                    <TableCell className="text-zinc-400">{t.lab}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={t.status === 'COMPLETED' ? 'text-emerald-400 border-emerald-500/20' : 'text-blue-400 border-blue-500/20'}>
                        {t.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white">Linked Communications</CardTitle>
            <CardDescription className="text-zinc-400">Emails and attachments mapped to this lot.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {lot.emails.map(e => (
                <div key={e.id} className="flex justify-between items-center p-3 rounded-lg bg-zinc-800/30 border border-zinc-800">
                  <div>
                    <p className="text-sm font-medium text-zinc-200">{e.subject}</p>
                    <p className="text-xs text-zinc-500">{e.received_at}</p>
                  </div>
                  <Badge variant="secondary" className="bg-zinc-800 text-zinc-300">
                    {e.attachments} Attachment(s)
                  </Badge>
                </div>
              ))}
              {lot.emails.length === 0 && (
                <p className="text-sm text-zinc-500 text-center py-4">No emails linked yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
