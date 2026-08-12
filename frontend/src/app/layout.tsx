import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SidebarNav } from "@/components/SidebarNav";

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
      <body
        className={`${inter.className} flex min-h-screen flex-col bg-zinc-950 text-zinc-50 antialiased md:flex-row`}
      >
        {/* Client component: knows the current route, hides itself on /login,
            and shows who is signed in. */}
        <SidebarNav />

        <main className="flex-1 overflow-y-auto p-6 md:p-12">{children}</main>
      </body>
    </html>
  );
}
