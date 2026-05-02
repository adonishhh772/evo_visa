"use client";

import type { RetrievedMemory } from "@/lib/types";

export type { RetrievedMemory };

type MemoryReusedPanelProps = {
  memories: RetrievedMemory[];
};

export function MemoryReusedPanel({ memories }: MemoryReusedPanelProps) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-6 shadow-xl shadow-black/30">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Memory reused</h2>
        <p className="text-sm text-zinc-400">
          Semantic memories surfaced for the follow-up answer, with hybrid scoring signals.
        </p>
      </div>
      {memories.length === 0 ? (
        <p className="text-sm text-zinc-500">No retrieved memories yet.</p>
      ) : (
        <ul className="space-y-4">
          {memories.map((memory) => (
            <li
              key={memory.memory_id || memory.learned_strategy}
              className="rounded-xl border border-white/[0.06] bg-black/25 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {memory.memory_id}
                </span>
                <span className="rounded-md bg-teal-500/15 px-2 py-1 text-xs font-semibold text-teal-200 ring-1 ring-teal-400/25">
                  score{" "}
                  {typeof memory.relevance_score === "number"
                    ? memory.relevance_score.toFixed(3)
                    : memory.relevance_score}
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold text-white">{memory.situation}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-400">{memory.learned_strategy}</p>
              <p className="mt-2 text-xs text-zinc-500">
                <span className="font-semibold text-zinc-300">Why selected: </span>
                {memory.selection_reason}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {(memory.tags || []).map((tag) => (
                  <span
                    key={`${memory.memory_id}-${tag}`}
                    className="rounded-full border border-white/[0.08] bg-black/30 px-2 py-1 text-[11px] font-medium text-zinc-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
