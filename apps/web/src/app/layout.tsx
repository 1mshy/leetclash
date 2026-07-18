import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeetClash",
  description: "Real-time 1v1 competitive coding duels",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        <nav className="flex items-center gap-6 border-b border-edge bg-panel px-6 py-3">
          <Link href="/" className="font-mono text-lg font-bold tracking-tight">
            <span className="text-accent">leet</span>
            <span className="text-zinc-100">clash</span>
          </Link>
          <Link
            href="/"
            className="text-sm text-zinc-400 transition-colors hover:text-zinc-100"
          >
            Lobby
          </Link>
          <Link
            href="/leaderboard"
            className="text-sm text-zinc-400 transition-colors hover:text-zinc-100"
          >
            Leaderboard
          </Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
