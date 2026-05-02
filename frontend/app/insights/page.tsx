"use client";

import { useCallback, useEffect, useState } from "react";
import { getEvaluationRuns, getMemories } from "@/lib/api";
import { UserProfilePageSection } from "@/components/profile/UserProfilePageSection";

type MemoryRow = Record<string, unknown>;
type RunRow = Record<string, unknown>;

export default function InsightsPage() {
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMemoryError(null);
    setRunsError(null);
    try {
      const memoryPayload = (await getMemories()) as {
        memories?: MemoryRow[];
        error?: string;
      };
      const runsPayload = (await getEvaluationRuns()) as {
        evaluation_runs?: RunRow[];
        error?: string;
      };
      setMemories(memoryPayload.memories || []);
      setRuns(runsPayload.evaluation_runs || []);
      if (memoryPayload.error) setMemoryError(memoryPayload.error);
      if (runsPayload.error) setRunsError(runsPayload.error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="min-h-screen bg-[#0c0c0e] px-6 py-10 text-zinc-100 md:px-10">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-teal-400/90">
              MongoDB intelligence
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Learnings & evaluation history
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
              Inspect your personalisation row, semantic memories from the reflection agent, and historical demo runs in{" "}
              <span className="font-mono text-zinc-300">evaluation_runs</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh data"}
          </button>
        </header>

        {(memoryError || runsError) && (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {memoryError && <p>Memories: {memoryError}</p>}
            {runsError && <p className={memoryError ? "mt-2" : ""}>Runs: {runsError}</p>}
          </div>
        )}

        <UserProfilePageSection />

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-white">Semantic memories</h2>
            <span className="rounded-full bg-white/[0.05] px-3 py-1 text-[11px] text-zinc-400">
              {memories.length} records
            </span>
          </div>
          {memories.length === 0 && !loading ? (
            <EmptyCard message="No semantic memories yet. Run the demo or chat to create reflections." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {memories.map((memory, index) => (
                <MemoryCard key={String(memory.memory_id ?? memory.source_query ?? index)} memory={memory} />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-white">Evaluation runs</h2>
            <span className="rounded-full bg-white/[0.05] px-3 py-1 text-[11px] text-zinc-400">
              {runs.length} records
            </span>
          </div>
          {runs.length === 0 && !loading ? (
            <EmptyCard message="No demo runs recorded yet. Execute the harness from the Demo page." />
          ) : (
            <div className="space-y-4">
              {runs.map((run, index) => (
                <RunCard key={String(run.run_id ?? run.created_at ?? index)} run={run} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.12] bg-zinc-900/30 px-6 py-10 text-center text-sm text-zinc-500">
      {message}
    </div>
  );
}

function MemoryCard({ memory }: { memory: MemoryRow }) {
  const tags = Array.isArray(memory.tags) ? (memory.tags as string[]) : [];
  return (
    <article className="rounded-2xl border border-white/[0.06] bg-gradient-to-br from-zinc-900/70 to-zinc-950/80 p-5 shadow-lg shadow-black/40">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
        <span className="font-mono text-[10px] text-teal-300/90">{String(memory.memory_id ?? "—")}</span>
        <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-zinc-400">
          usage {String(memory.usage_count ?? 0)}
        </span>
        <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-zinc-400">
          Δ avg {String(memory.average_score_improvement ?? 0)}
        </span>
      </div>
      <h3 className="mt-3 text-base font-semibold text-white">{String(memory.situation ?? "")}</h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{String(memory.learned_strategy ?? "")}</p>
      <p className="mt-3 text-[11px] uppercase tracking-wide text-zinc-600">Source query</p>
      <p className="text-sm text-zinc-500">{String(memory.source_query ?? "")}</p>
      {tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-white/[0.08] bg-black/30 px-3 py-1 text-[11px] text-zinc-300"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function RunCard({ run }: { run: RunRow }) {
  const improvement = Number(run.improvement ?? 0);
  const strategy = run.retrieval_strategy_used as Record<string, unknown> | undefined;
  const reason = strategy && typeof strategy.reason === "string" ? strategy.reason : "";

  return (
    <article className="rounded-2xl border border-white/[0.06] bg-zinc-900/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] text-zinc-500">{String(run.run_id ?? "")}</p>
          <p className="text-[11px] text-zinc-600">{String(run.created_at ?? "")}</p>
        </div>
        <div
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            improvement >= 0
              ? "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30"
              : "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30"
          }`}
        >
          Δ {improvement >= 0 ? "+" : ""}
          {improvement} pts
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Initial query</p>
          <p className="mt-1 text-sm text-zinc-300">{String(run.initial_query ?? "")}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Follow-up</p>
          <p className="mt-1 text-sm text-zinc-300">{String(run.follow_up_query ?? "")}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <ScorePill label="Before" value={Number(run.score_without_memory ?? 0)} />
        <ScorePill label="After" value={Number(run.score_with_memory ?? 0)} highlight />
      </div>
      {reason && (
        <div className="mt-4 rounded-xl border border-white/[0.05] bg-black/30 px-4 py-3 text-sm text-zinc-400">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
            Retrieval trace ·{" "}
          </span>
          {reason}
        </div>
      )}
    </article>
  );
}

function ScorePill({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        highlight
          ? "bg-teal-500/15 text-teal-100 ring-1 ring-teal-400/25"
          : "bg-white/[0.05] text-zinc-300"
      }`}
    >
      {label}: {value}/30
    </span>
  );
}
