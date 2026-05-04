"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
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
  metadata?: Record<string, unknown> | null;
  /** Populated by API for UNMAPPED reports when `lot_number` matches a Lot row */
  lotMatch?: { product?: { name?: string | null } | null } | null;
  test?: {
    lot?: {
      lot_number?: string | null;
      product?: { name?: string | null } | null;
    } | null;
    lab?: { name?: string | null } | null;
    test_type?: { name?: string | null } | null;
  } | null;
  email?: {
    subject?: string | null;
    from_email?: string | null;
  } | null;
  moleculeResults?: unknown[];
};

function productDisplayName(report: ReviewReport): string {
  const fromLot = report.test?.lot?.product?.name?.trim();
  if (fromLot) return fromLot;
  const fromLotMatch = report.lotMatch?.product?.name?.trim();
  if (fromLotMatch) return fromLotMatch;
  const sample = report.metadata?.sampleName;
  if (typeof sample === "string" && sample.trim()) return sample.trim();
  return "—";
}

function getApiBaseUrl() {
  return `http://${window.location.hostname}:4000/api`;
}

export default function ReviewsPage() {
  const [reports, setReports] = useState<ReviewReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadReports() {
      try {
        const res = await fetch(`${getApiBaseUrl()}/reviews?status=PENDING_REVIEW`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to load reviews.");
        }
        setReports(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load reviews.");
      } finally {
        setLoading(false);
      }
    }

    void loadReports();
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-white">Report Review</h2>
        <p className="text-zinc-400 mt-2">Verify AI-extracted lab reports against the original email and attachment evidence.</p>
      </div>

      <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-xl">
        <CardHeader>
          <CardTitle className="text-zinc-100">Pending Reviews</CardTitle>
          <CardDescription className="text-zinc-400">Reports matched to lots and waiting for human confirmation.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-zinc-800">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Lot</TableHead>
                  <TableHead className="text-zinc-400">Product</TableHead>
                  <TableHead className="text-zinc-400">Test</TableHead>
                  <TableHead className="text-zinc-400">Lab</TableHead>
                  <TableHead className="text-zinc-400">Source</TableHead>
                  <TableHead className="text-zinc-400">Molecules</TableHead>
                  <TableHead className="text-zinc-400">Received</TableHead>
                  <TableHead className="text-zinc-400 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-zinc-500 py-8">Loading reviews...</TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-zinc-500 py-8">{error}</TableCell>
                  </TableRow>
                ) : reports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-zinc-500 py-8">No reports are waiting for review.</TableCell>
                  </TableRow>
                ) : (
                  reports.map((report) => (
                    <TableRow key={report.id} className="border-zinc-800 hover:bg-zinc-800/50 transition-colors">
                      <TableCell className="text-emerald-400 font-mono text-sm">
                        {report.test?.lot?.lot_number || report.lot_number || "-"}
                      </TableCell>
                      <TableCell className="text-zinc-200 max-w-[200px] truncate" title={productDisplayName(report)}>
                        {productDisplayName(report)}
                      </TableCell>
                      <TableCell className="text-zinc-200">{report.test?.test_type?.name || "Unknown"}</TableCell>
                      <TableCell className="text-zinc-400">{report.test?.lab?.name || "Unknown"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="border-amber-500/30 text-amber-400">
                            {report.source_type}
                          </Badge>
                          {report.source_attachment_filename && (
                            <span className="text-xs text-zinc-500 truncate max-w-[180px]" title={report.source_attachment_filename}>
                              {report.source_attachment_filename}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-zinc-300">{report.moleculeResults?.length || 0}</TableCell>
                      <TableCell className="text-zinc-400">
                        {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/reviews/${report.id}`} className="text-amber-400 hover:underline text-sm">
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
