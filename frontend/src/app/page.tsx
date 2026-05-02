"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { FileCheck2, FlaskConical, Inbox, Waypoints } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type ReviewReport = {
  id: string;
  lot_number?: string | null;
  source_type: string;
  source_attachment_filename?: string | null;
  status: string;
  createdAt: string;
  test?: {
    lot?: { lot_number?: string | null } | null;
    lab?: { name?: string | null } | null;
    test_type?: { name?: string | null } | null;
  } | null;
  email?: {
    subject?: string | null;
    from_email?: string | null;
  } | null;
  moleculeResults?: unknown[];
};

function getApiBaseUrl() {
  return `http://${window.location.hostname}:4000/api`;
}

function getLotNumber(report: ReviewReport) {
  return report.test?.lot?.lot_number || report.lot_number || "-";
}

export default function Dashboard() {
  const [reports, setReports] = useState<ReviewReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadReports() {
      try {
        const res = await fetch(`${getApiBaseUrl()}/reviews?status=PENDING_REVIEW`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to load reports to review.");
        }

        setReports(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load reports to review.");
      } finally {
        setLoading(false);
      }
    }

    void loadReports();
  }, []);

  const uniqueLots = new Set(reports.map(getLotNumber).filter((lot) => lot !== "-")).size;
  const uniqueLabs = new Set(reports.map((report) => report.test?.lab?.name).filter(Boolean)).size;
  const reportsWithAttachments = reports.filter((report) => report.source_attachment_filename).length;
  const totalMolecules = reports.reduce((sum, report) => sum + (report.moleculeResults?.length || 0), 0);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Dashboard</h2>
          <p className="mt-2 text-zinc-400">
            Review-ready lab reports waiting for confirmation before they move forward.
          </p>
        </div>
        <Link href="/reviews" className="text-sm font-medium text-amber-400 hover:underline">
          Open full review queue
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Pending Reviews</CardTitle>
            <FileCheck2 className="h-4 w-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{loading ? "-" : reports.length}</div>
            <p className="mt-1 text-xs text-zinc-500">Reports currently waiting for human review</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Lots Impacted</CardTitle>
            <Waypoints className="h-4 w-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{loading ? "-" : uniqueLots}</div>
            <p className="mt-1 text-xs text-zinc-500">Distinct lots represented in the queue</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Labs In Queue</CardTitle>
            <FlaskConical className="h-4 w-4 text-sky-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{loading ? "-" : uniqueLabs}</div>
            <p className="mt-1 text-xs text-zinc-500">Testing labs represented across pending reports</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">Extracted Molecules</CardTitle>
            <Inbox className="h-4 w-4 text-fuchsia-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-white">{loading ? "-" : totalMolecules}</div>
            <p className="mt-1 text-xs text-zinc-500">
              {loading ? "Loading extracted analyte rows" : `${reportsWithAttachments} reports linked to attachments`}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-zinc-100">Reports To Review</CardTitle>
          <CardDescription className="text-zinc-400">
            Open any report below to verify extraction details against the original evidence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-zinc-800">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Lot</TableHead>
                  <TableHead className="text-zinc-400">Test</TableHead>
                  <TableHead className="text-zinc-400">Lab</TableHead>
                  <TableHead className="text-zinc-400">Source</TableHead>
                  <TableHead className="text-zinc-400">Molecules</TableHead>
                  <TableHead className="text-zinc-400">Received</TableHead>
                  <TableHead className="text-right text-zinc-400">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-zinc-500">
                      Loading reports to review...
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-red-400">
                      {error}
                    </TableCell>
                  </TableRow>
                ) : reports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-zinc-500">
                      No reports are waiting for review.
                    </TableCell>
                  </TableRow>
                ) : (
                  reports.map((report) => (
                    <TableRow key={report.id} className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                      <TableCell className="font-mono text-sm text-emerald-400">
                        {getLotNumber(report)}
                      </TableCell>
                      <TableCell className="text-zinc-200">
                        {report.test?.test_type?.name || "Unknown"}
                      </TableCell>
                      <TableCell className="text-zinc-400">
                        {report.test?.lab?.name || "Unknown"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="w-fit border-amber-500/30 text-amber-400">
                            {report.source_type}
                          </Badge>
                          {report.source_attachment_filename ? (
                            <span
                              className="max-w-[220px] truncate text-xs text-zinc-500"
                              title={report.source_attachment_filename}
                            >
                              {report.source_attachment_filename}
                            </span>
                          ) : report.email?.subject ? (
                            <span className="max-w-[220px] truncate text-xs text-zinc-500" title={report.email.subject}>
                              {report.email.subject}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-zinc-300">{report.moleculeResults?.length || 0}</TableCell>
                      <TableCell className="text-zinc-400">
                        {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/reviews/${report.id}`} className="text-sm text-amber-400 hover:underline">
                          Open review
                        </Link>
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
