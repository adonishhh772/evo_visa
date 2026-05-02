"use client";

import { useUserProfile } from "./UserProfileContext";

/** Full-width panel for Learnings and other content pages. */
export function UserProfilePageSection() {
  const { profile, loading, reloadProfile } = useUserProfile();

  return (
    <section className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-950/25 to-zinc-900/40 p-6 shadow-lg shadow-black/30">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Your personalisation profile</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Stored in MongoDB as <span className="font-mono text-zinc-300">user_profiles</span>. Includes answer
            preferences (<span className="font-mono text-zinc-300">preferred_style</span>, persona bullets), situation (
            <span className="font-mono text-zinc-300">uk_presence</span>, location), tone, psychology, and topic hints —
            merged after each reply.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reloadProfile()}
          disabled={loading}
          className="rounded-xl border border-white/[0.1] bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.08] disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh from API"}
        </button>
      </div>

      {loading && profile === undefined ? (
        <p className="mt-6 text-sm text-zinc-500">Loading profile…</p>
      ) : profile === null ? (
        <p className="mt-6 text-sm text-zinc-500">Profile API unavailable.</p>
      ) : (
        <pre className="mt-6 max-h-96 overflow-auto rounded-xl border border-white/[0.06] bg-black/40 p-4 text-left text-xs leading-relaxed text-zinc-400">
          {JSON.stringify(profile, null, 2)}
        </pre>
      )}
    </section>
  );
}
