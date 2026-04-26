import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "IPM Tracking System",
  description: "Central traceability and quality control backbone",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} min-h-screen bg-zinc-950 text-zinc-50 flex flex-col md:flex-row antialiased`}>
        {/* Sidebar */}
        <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-zinc-800 bg-zinc-900/50 p-6 flex flex-col gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-emerald-500 flex items-center justify-center font-bold text-zinc-950">
              IPM
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Traceability</h1>
          </div>
          
          <nav className="flex flex-col gap-2">
            <Link href="/" className="px-4 py-2 rounded-md hover:bg-zinc-800 transition-colors text-sm font-medium text-zinc-400 hover:text-zinc-50">
              Dashboard
            </Link>
            <Link href="/tests" className="px-4 py-2 rounded-md hover:bg-zinc-800 transition-colors text-sm font-medium text-zinc-400 hover:text-zinc-50">
              Tests & Lots
            </Link>
            <Link href="/mapping" className="px-4 py-2 rounded-md hover:bg-zinc-800 transition-colors text-sm font-medium text-zinc-400 hover:text-zinc-50">
              Email Mapping
            </Link>
            <Link href="/email-logs" className="px-4 py-2 rounded-md hover:bg-zinc-800 transition-colors text-sm font-medium text-zinc-400 hover:text-zinc-50">
              Email Logs
            </Link>
            <Link href="/tracked-emails" className="px-4 py-2 rounded-md hover:bg-zinc-800 transition-colors text-sm font-medium text-zinc-400 hover:text-zinc-50">
              Tracked Inbox
            </Link>
            <Link href="/settings" className="px-4 py-2 rounded-md hover:bg-zinc-800 transition-colors text-sm font-medium text-zinc-400 hover:text-zinc-50">
              Settings
            </Link>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 md:p-12 overflow-y-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
