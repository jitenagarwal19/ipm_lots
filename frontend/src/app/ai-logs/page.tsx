"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getApiBaseUrl } from "@/lib/utils";

export default function AILogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<any>(null);

  useEffect(() => {
    fetch(`${getApiBaseUrl()}/ailogs`)
      .then(res => res.json())
      .then(data => {
        setLogs(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch AI logs:", err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-white">AI Logs</h2>
        <p className="text-zinc-400 mt-2">Audit trail of prompts sent to and structured JSON responses received from ChatGPT.</p>
      </div>

      <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-zinc-100">Processing Logs</CardTitle>
          <CardDescription className="text-zinc-400">Review exactly what data was passed to the AI.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-zinc-800">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400 w-[150px]">Date</TableHead>
                  <TableHead className="text-zinc-400 w-[150px]">Message ID</TableHead>
                  <TableHead className="text-zinc-400">Response Snippet</TableHead>
                  <TableHead className="text-zinc-400 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-zinc-500 py-8">Loading logs...</TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-zinc-500 py-8">No AI logs found.</TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id} className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                      <TableCell className="text-zinc-300 font-medium text-sm">
                        {log.createdAt ? format(new Date(log.createdAt), "MMM d, HH:mm:ss") : '-'}
                      </TableCell>
                      <TableCell className="text-zinc-300 text-sm font-mono truncate" title={log.message_id}>{log.message_id || 'N/A'}</TableCell>
                      <TableCell className="text-zinc-400 text-xs font-mono truncate max-w-[400px]">
                        {log.response_received}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)} className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10">View Details</Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-[95vw] h-[90vh] bg-zinc-900 border-zinc-800 text-white flex flex-col">
          <DialogHeader>
            <DialogTitle>AI Log Details</DialogTitle>
            <DialogDescription className="text-zinc-400">Message ID: {selectedLog?.message_id}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 flex-1 overflow-hidden mt-4">
            <div className="flex flex-col border border-zinc-800 rounded-md">
              <div className="bg-zinc-950 p-3 border-b border-zinc-800 font-semibold text-sm text-zinc-300 sticky top-0">Prompt Sent (Body + Extracted PDF)</div>
              <div className="flex-1 p-4 bg-zinc-900/50 overflow-y-auto">
                <pre className="text-sm text-zinc-400 whitespace-pre-wrap font-mono leading-relaxed break-words">
                  {selectedLog?.prompt_sent}
                </pre>
              </div>
            </div>
            <div className="flex flex-col border border-zinc-800 rounded-md">
              <div className="bg-zinc-950 p-3 border-b border-zinc-800 font-semibold text-sm text-zinc-300 sticky top-0">Response Received (JSON)</div>
              <div className="flex-1 p-4 bg-zinc-900/50 overflow-y-auto">
                <pre className="text-sm text-emerald-400 whitespace-pre-wrap font-mono leading-relaxed break-words">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(selectedLog?.response_received || '{}'), null, 2);
                    } catch {
                      return selectedLog?.response_received;
                    }
                  })()}
                </pre>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
