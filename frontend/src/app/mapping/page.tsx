"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export default function MappingPage() {
  const [selectedTest, setSelectedTest] = useState<string | null>(null);

  // Mock data for emails
  const unmappedEmails = [
    {
      id: "msg-123",
      subject: "Fwd: Test Report for LOT-2024-001 (Pesticide)",
      from: "reports@eurofins.com",
      received_at: "2024-04-25T10:00:00Z",
      attachments: ["Eurofins_LOT-2024-001.pdf"]
    },
    {
      id: "msg-124",
      subject: "Aflatoxin Results - LOT-2024-002",
      from: "spice.test@sgs.com",
      received_at: "2024-04-24T14:30:00Z",
      attachments: ["SGS_Report_002.pdf", "invoice.pdf"]
    }
  ];

  const pendingTests = [
    { id: "test-1", label: "LOT-2024-001 - Pesticide Residue (Eurofins)" },
    { id: "test-2", label: "LOT-2024-002 - Aflatoxin (SGS Lab)" }
  ];

  const handleMap = (emailId: string) => {
    if (!selectedTest) return alert("Please select a test to map to.");
    console.log(`Mapping email ${emailId} to test ${selectedTest}`);
    // Call backend API to map email to test
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-white">Email Mapping</h2>
        <p className="text-zinc-400 mt-2">Manually link incoming lab reports to the corresponding test requests.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {unmappedEmails.map((email) => (
          <Card key={email.id} className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl flex flex-col">
            <CardHeader>
              <CardTitle className="text-lg text-white truncate" title={email.subject}>
                {email.subject}
              </CardTitle>
              <CardDescription className="text-zinc-400">
                From: <span className="text-zinc-300">{email.from}</span>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
              <div>
                <Label className="text-xs text-zinc-500 uppercase tracking-wider">Received</Label>
                <p className="text-sm text-zinc-300">{new Date(email.received_at).toLocaleString()}</p>
              </div>
              
              <div>
                <Label className="text-xs text-zinc-500 uppercase tracking-wider mb-2 block">Attachments</Label>
                <div className="space-y-2">
                  {email.attachments.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 rounded-md bg-zinc-800/50 border border-zinc-700">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <span className="text-sm text-zinc-300 truncate">{file}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-800">
                <Label className="text-xs text-zinc-500 uppercase tracking-wider mb-2 block">Link to Test Request</Label>
                <Select onValueChange={setSelectedTest}>
                  <SelectTrigger className="w-full bg-zinc-950 border-zinc-700 text-zinc-200">
                    <SelectValue placeholder="Select a pending test..." />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-200">
                    {pendingTests.map(test => (
                      <SelectItem key={test.id} value={test.id}>{test.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
            <CardFooter className="pt-0">
              <Button 
                onClick={() => handleMap(email.id)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Map Email to Test
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
