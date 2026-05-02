"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { getApiBaseUrl } from "@/lib/utils";

type TestRow = {
  id: string;
  lot_id: string;
  status: string;
  createdAt: string;
  lot?: {
    lot_number?: string | null;
  } | null;
  test_type?: {
    name?: string | null;
  } | null;
  lab?: {
    name?: string | null;
  } | null;
  labReports?: {
    id: string;
    status: string;
  }[];
};

type FetchEmailsResponse = {
  error?: string;
  processedCount?: number;
  mappedCount?: number;
  skippedCount?: number;
  errorCount?: number;
};

export default function TestsPage() {
  const [tests, setTests] = useState<TestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFetchingEmails, setIsFetchingEmails] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState<string | null>(null);

  const loadTests = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/tests`);
      if (res.ok) {
        const data = await res.json();
        setTests(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetching initial API state on mount is intentional for this page.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTests();
    const storedFetchTime = localStorage.getItem("lastEmailFetchTime");
    if (storedFetchTime) {
      setLastFetchTime(storedFetchTime);
    }
  }, []);

  const handleFetchEmails = async () => {
    setIsFetchingEmails(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/tests/fetch-emails`, {
        method: 'POST'
      });
      const data: FetchEmailsResponse = await res.json();
      if (res.ok) {
        const now = new Date().toISOString();
        setLastFetchTime(now);
        localStorage.setItem("lastEmailFetchTime", now);
        
        const processedCount = data.processedCount || 0;
        const skippedCount = data.skippedCount || 0;
        if (processedCount > 0) {
          alert(`Fetched ${processedCount} new report email${processedCount === 1 ? '' : 's'}.\nMapped to tests: ${data.mappedCount || 0}\nSkipped: ${skippedCount}${data.errorCount ? `\nErrors: ${data.errorCount}` : ''}`);
          await loadTests(); // Reload to show updated statuses
        } else {
          alert(`No new lab reports found.${skippedCount ? `\nSkipped: ${skippedCount}` : ''}`);
        }
      } else {
        alert(data.error || "Failed to fetch emails.");
      }
    } catch (e) {
      console.error("Failed to fetch emails:", e);
      alert("Error fetching emails");
    } finally {
      setIsFetchingEmails(false);
    }
  };

  const getStatusStyle = (status: string) => {
    switch(status) {
      case 'INITIATED': return 'bg-zinc-500/10 text-zinc-400';
      case 'AWAITING_REPORT': return 'bg-blue-500/10 text-blue-400';
      case 'REPORT_RECEIVED': return 'bg-purple-500/10 text-purple-400';
      case 'UNDER_REVIEW': return 'bg-amber-500/10 text-amber-400';
      case 'COMPLETED': return 'bg-emerald-500/10 text-emerald-400';
      default: return 'bg-zinc-500/10 text-zinc-400';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Tests & Lots</h2>
          <p className="text-zinc-400 mt-2">Manage your spice lots and lab test requests.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-end mr-2">
            <Button 
              variant="outline" 
              className="border-zinc-700 bg-zinc-800/50 text-white hover:bg-zinc-800"
              onClick={handleFetchEmails}
              disabled={isFetchingEmails}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isFetchingEmails ? 'animate-spin' : ''}`} />
              {isFetchingEmails ? 'Fetching...' : 'Fetch Emails'}
            </Button>
            {lastFetchTime && (
              <span className="text-xs text-zinc-500 mt-1">
                Last fetched: {formatDistanceToNow(new Date(lastFetchTime), { addSuffix: true })}
              </span>
            )}
          </div>
          <Link href="/tests/new">
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium">
              Create Test Request
            </Button>
          </Link>
        </div>
      </div>

      <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-white">Recent Tests</CardTitle>
          <CardDescription className="text-zinc-400">View and track the status of all tests.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400">Lot Number</TableHead>
                <TableHead className="text-zinc-400">Test Type</TableHead>
                <TableHead className="text-zinc-400">Lab</TableHead>
                <TableHead className="text-zinc-400">Status</TableHead>
                <TableHead className="text-zinc-400">Review</TableHead>
                <TableHead className="text-zinc-400 text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-zinc-500 py-8">Loading tests...</TableCell>
                </TableRow>
              ) : tests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-zinc-500 py-8">No tests initiated yet.</TableCell>
                </TableRow>
              ) : (
                tests.map((test) => (
                  <TableRow key={test.id} className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                    <TableCell className="font-medium text-emerald-400 cursor-pointer hover:underline">
                      <Link href={`/lots/${test.lot_id}`}>
                        {test.lot?.lot_number || "Unknown"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-zinc-200">
                      <Link href={`/tests/${test.id}`} className="hover:text-emerald-400 hover:underline">
                        {test.test_type?.name || "Unknown"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-zinc-400">{test.lab?.name || "Unknown"}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusStyle(test.status)}`}>
                        {test.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-zinc-300">
                      {test.labReports?.[0] ? (
                        <Link href={`/reviews/${test.labReports[0].id}`} className="text-amber-400 hover:underline text-sm">
                          Review report
                        </Link>
                      ) : (
                        <span className="text-zinc-600">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-zinc-400">
                      {new Date(test.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
