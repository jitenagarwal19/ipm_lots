"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getApiBaseUrl } from "@/lib/utils";

export default function EmailLogsPage() {
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = `${getApiBaseUrl()}/emails`;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`Request failed (${res.status}). ${text}`.trim());
        }
        const data = await res.json();
        if (cancelled) return;
        setEmails(Array.isArray(data) ? data : []);
      } catch (e: any) {
        if (cancelled) return;
        const msg =
          e?.name === "TypeError"
            ? `Could not reach backend at ${url}. Is the backend running?`
            : e?.message || "Failed to load email logs.";
        setError(msg);
        setEmails([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-white">Email Logs</h2>
        <p className="text-zinc-400 mt-2">View all sent and received email communications.</p>
      </div>

      <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-zinc-100">Communication History</CardTitle>
          <CardDescription className="text-zinc-400">Chronological log of all emails dispatched and received by the system.</CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-md border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
              {error}
            </div>
          ) : null}
          <div className="rounded-md border border-zinc-800">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Date</TableHead>
                  <TableHead className="text-zinc-400">Direction</TableHead>
                  <TableHead className="text-zinc-400">Subject</TableHead>
                  <TableHead className="text-zinc-400">From</TableHead>
                  <TableHead className="text-zinc-400">To</TableHead>
                  <TableHead className="text-zinc-400">Related Lot</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-zinc-500 py-8">Loading logs...</TableCell>
                  </TableRow>
                ) : emails.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-zinc-500 py-8">No email logs found.</TableCell>
                  </TableRow>
                ) : (
                  emails.map((email) => (
                    <TableRow key={email.id} className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                      <TableCell className="text-zinc-300 font-medium whitespace-nowrap">
                        {format(new Date(email.received_at), "MMM d, yyyy HH:mm")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={email.direction === "SENT" ? "text-blue-400 border-blue-400/30 bg-blue-400/10" : "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"}>
                          {email.direction}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-zinc-200">{email.subject || '-'}</TableCell>
                      <TableCell className="text-zinc-400">{email.from_email}</TableCell>
                      <TableCell className="text-zinc-400">{email.to_email || '-'}</TableCell>
                      <TableCell className="text-zinc-400">
                        {email.test?.lot?.lot_number ? (
                          <span className="font-mono bg-zinc-800 px-2 py-1 rounded text-xs">{email.test.lot.lot_number}</span>
                        ) : '-'}
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
