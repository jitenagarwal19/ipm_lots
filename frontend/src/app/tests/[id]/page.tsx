"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function TestViewPage() {
  // Mock Data
  const test = {
    id: "TEST-001",
    lot_number: "LOT-2024-001",
    type: "Pesticide Residue",
    lab: "Eurofins",
    destination: "EU",
    status: "AWAITING_REPORT",
    created_at: "2024-04-20 10:30 AM",
    emails: [
      { id: "e1", subject: "Test Request: LOT-2024-001", type: "OUTBOUND", date: "2024-04-20 10:31 AM" }
    ],
    attachments: []
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-4">
            <h2 className="text-3xl font-bold tracking-tight text-white">{test.type} Test</h2>
            <Badge className="bg-blue-500/10 text-blue-400 hover:bg-blue-500/20">{test.status}</Badge>
          </div>
          <p className="text-zinc-400 mt-2">Lot: <span className="text-emerald-400 font-medium cursor-pointer hover:underline">{test.lot_number}</span> | Lab: {test.lab}</p>
        </div>
        <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800">
          Mark as Completed
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl md:col-span-2">
          <CardHeader>
            <CardTitle className="text-white">Test Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="grid grid-cols-2 gap-4">
               <div>
                 <p className="text-xs text-zinc-500 uppercase tracking-wider">Destination</p>
                 <p className="text-sm text-zinc-200 mt-1">{test.destination}</p>
               </div>
               <div>
                 <p className="text-xs text-zinc-500 uppercase tracking-wider">Initiated At</p>
                 <p className="text-sm text-zinc-200 mt-1">{test.created_at}</p>
               </div>
             </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-white">Attachments</CardTitle>
          </CardHeader>
          <CardContent>
            {test.attachments.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-8">No attachments found.</p>
            ) : (
              <div>{/* Map attachments here */}</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl md:col-span-3">
          <CardHeader>
            <CardTitle className="text-white">Email Thread</CardTitle>
            <CardDescription className="text-zinc-400">All communications regarding this specific test.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 border-l-2 border-zinc-800 ml-3 pl-6 relative">
              {test.emails.map((e, idx) => (
                <div key={e.id} className="relative">
                  <span className="absolute -left-[33px] top-1 h-3 w-3 rounded-full bg-zinc-700 border-2 border-zinc-900"></span>
                  <div className="bg-zinc-800/30 border border-zinc-800 p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <Badge variant="outline" className={e.type === 'OUTBOUND' ? 'border-zinc-700 text-zinc-400' : 'border-emerald-500/30 text-emerald-400'}>
                        {e.type}
                      </Badge>
                      <span className="text-xs text-zinc-500">{e.date}</span>
                    </div>
                    <p className="text-sm text-zinc-200">{e.subject}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
