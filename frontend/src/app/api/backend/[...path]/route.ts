import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BACKEND =
  process.env.BACKEND_INTERNAL_URL ||
  process.env.BACKEND_URL ||
  "http://127.0.0.1:4000";

const TOKEN =
  (process.env.BACKEND_SERVICE_TOKEN || process.env.SERVICE_API_KEY || "").trim();

async function proxy(req: NextRequest, pathSegments: string[]) {
  const path = pathSegments.join("/");
  const base = BACKEND.replace(/\/+$/, "");
  const target = new URL(`${base}/api/${path}`);
  target.search = req.nextUrl.search;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "connection") return;
    headers.set(key, value);
  });
  if (TOKEN) {
    headers.set("Authorization", `Bearer ${TOKEN}`);
  }

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
  };

  if (!["GET", "HEAD"].includes(req.method)) {
    const buf = await req.arrayBuffer();
    if (buf.byteLength > 0) {
      init.body = buf;
    }
  }

  const backendRes = await fetch(target, init);
  const outHeaders = new Headers(backendRes.headers);
  outHeaders.delete("transfer-encoding");

  return new NextResponse(backendRes.body, {
    status: backendRes.status,
    statusText: backendRes.statusText,
    headers: outHeaders,
  });
}

type RouteCtx = { params: Promise<{ path?: string[] }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { path = [] } = await ctx.params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { path = [] } = await ctx.params;
  return proxy(req, path);
}

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  const { path = [] } = await ctx.params;
  return proxy(req, path);
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const { path = [] } = await ctx.params;
  return proxy(req, path);
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const { path = [] } = await ctx.params;
  return proxy(req, path);
}
