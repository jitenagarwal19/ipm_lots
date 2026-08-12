"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getApiBaseUrl } from "@/lib/utils";

const API_BASE_URL = getApiBaseUrl();

const LINKS: Array<[string, string]> = [
  ["/", "Dashboard"],
  ["/tests", "Tests & Lots"],
  ["/mapping", "Email Mapping"],
  ["/reviews", "Report Review"],
  ["/limits", "MRL Lookup"],
  ["/email-logs", "Email Logs"],
  ["/tracked-emails", "Tracked Inbox"],
  ["/ai-logs", "AI Logs"],
  ["/settings", "Settings"],
];

export function SidebarNav() {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (pathname === "/login") return;
    fetch(`${API_BASE_URL}/auth/me`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setEmail(d?.email ?? null))
      .catch(() => setEmail(null));
  }, [pathname]);

  // The sign-in screen is its own full-page view — no nav to a place you
  // cannot yet go.
  if (pathname === "/login") return null;

  const signOut = async () => {
    await fetch(`${API_BASE_URL}/auth/logout`, { method: "POST" }).catch(() => undefined);
    // Full reload so nothing fetched under the old session survives in memory.
    window.location.href = "/login";
  };

  return (
    <aside className="flex w-full flex-col gap-6 border-b border-zinc-800 bg-zinc-900/50 p-6 md:w-64 md:border-b-0 md:border-r">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-emerald-500 font-bold text-zinc-950">
          IPM
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Traceability</h1>
      </div>

      <nav className="flex flex-col gap-2">
        {LINKS.map(([href, label]) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-zinc-800 text-zinc-50"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-50"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {email && (
        <div className="mt-auto border-t border-zinc-800 pt-4">
          <p className="truncate text-xs text-zinc-500" title={email}>
            {email}
          </p>
          <button
            type="button"
            onClick={signOut}
            className="mt-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
          >
            Sign out
          </button>
        </div>
      )}
    </aside>
  );
}
