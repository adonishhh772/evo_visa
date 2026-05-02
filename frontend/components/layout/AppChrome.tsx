"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { UserProfileProvider } from "@/components/profile/UserProfileContext";
import { UserProfileSidebarCard } from "@/components/profile/UserProfileSidebarCard";
import { UserProvider, useUserId } from "./UserContext";

const NAV = [
  { href: "/", label: "Chat", description: "Adaptive visa assistant" },
  { href: "/demo", label: "Demo", description: "Before / after harness" },
  { href: "/knowledge", label: "Knowledge", description: "GOV.UK ingest & chunks" },
  { href: "/flow", label: "Architecture", description: "Agent harness diagram" },
  { href: "/insights", label: "Learnings", description: "MongoDB memory & runs" },
];

function SidebarChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { userId, setUserId } = useUserId();

  return (
    <div className="min-h-screen bg-[#0c0c0e] text-zinc-100">
      <aside className="fixed inset-y-0 left-0 z-40 flex h-screen w-[272px] flex-col overflow-y-auto overscroll-y-contain border-r border-white/[0.06] bg-gradient-to-b from-zinc-900/90 to-zinc-950/95 backdrop-blur-xl">
        <div className="border-b border-white/[0.06] px-5 py-6">
          <Link href="/" className="group block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-teal-400/90">
              EvoVisa
            </p>
            <p className="mt-1 text-lg font-semibold tracking-tight text-white group-hover:text-teal-50">
              Skilled Worker harness
            </p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-500">
              Adaptive retrieval · MongoDB memory · Multi-agent
            </p>
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-xl px-3 py-2.5 transition ${
                  active
                    ? "bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
                }`}
              >
                <div className="text-sm font-medium">{item.label}</div>
                <div className="text-[11px] text-zinc-500">{item.description}</div>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/[0.06] px-4 py-4">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Session user ID
          </label>
          <input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            className="mt-2 w-full rounded-lg border border-white/[0.08] bg-black/30 px-3 py-2 text-sm text-zinc-100 outline-none ring-teal-500/0 transition placeholder:text-zinc-600 focus:border-teal-500/40 focus:ring-2 focus:ring-teal-500/20"
            placeholder="demo_user"
            spellCheck={false}
          />
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">
            Stored locally. Episodic memory and your tone/psychology profile row are keyed per user.
          </p>
        </div>

        <UserProfileSidebarCard />
      </aside>

      <div className="relative ml-[272px] flex min-h-screen min-w-0 flex-col">{children}</div>
    </div>
  );
}

export function AppChrome({ children }: { children: ReactNode }) {
  return (
    <UserProvider>
      <UserProfileProvider>
        <SidebarChrome>{children}</SidebarChrome>
      </UserProfileProvider>
    </UserProvider>
  );
}
