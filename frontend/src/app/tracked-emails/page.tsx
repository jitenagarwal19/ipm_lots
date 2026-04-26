"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function TrackedEmailsPage() {
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const handleProcess = async (messageId: string) => {
    setProcessingIds(prev => new Set(prev).add(messageId));
    try {
      const res = await fetch(`http://localhost:4000/api/emails/process/${messageId}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok) {
        alert("Error: " + (data.error || "Failed to process"));
      } else {
        alert(`Status: ${data.status}\nExtracted Lot: ${data.analysis?.lotNumber || 'None'}`);
      }
    } catch (err) {
      alert("Network error while processing.");
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  };

  useEffect(() => {
    fetch("http://localhost:4000/api/emails/tracked")
      .then(res => res.json())
      .then(data => {
        setEmails(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch tracked emails:", err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-white">Tracked Inbox</h2>
        <p className="text-zinc-400 mt-2">Live feed of emails matching your configured labels from Gmail.</p>
      </div>

      <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-zinc-100">Live Gmail Feed</CardTitle>
          <CardDescription className="text-zinc-400">Emails matching the tracked labels specified in your Settings.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-zinc-800">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400 w-[150px]">Date</TableHead>
                  <TableHead className="text-zinc-400 w-[200px]">From</TableHead>
                  <TableHead className="text-zinc-400">Subject</TableHead>
                  <TableHead className="text-zinc-400">Snippet</TableHead>
                  <TableHead className="text-zinc-400 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-zinc-500 py-8">Fetching from Gmail...</TableCell>
                  </TableRow>
                ) : emails.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-zinc-500 py-8">No emails found matching your tracked labels.</TableCell>
                  </TableRow>
                ) : (
                  emails.map((email) => (
                    <TableRow key={email.id} className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                      <TableCell className="text-zinc-300 font-medium whitespace-nowrap text-sm">
                        {email.date ? format(new Date(email.date), "MMM d, HH:mm") : '-'}
                      </TableCell>
                      <TableCell className="text-zinc-300 text-sm truncate max-w-[200px]" title={email.from}>{email.from}</TableCell>
                      <TableCell className="text-zinc-100 font-medium">{email.subject}</TableCell>
                      <TableCell className="text-zinc-400 text-sm truncate max-w-[300px]" title={email.snippet}>{email.snippet}</TableCell>
                      <TableCell className="text-right">
                        <button 
                          onClick={() => handleProcess(email.id)}
                          disabled={processingIds.has(email.id)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-md disabled:opacity-50 transition-colors"
                        >
                          {processingIds.has(email.id) ? 'Processing...' : 'Process'}
                        </button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
