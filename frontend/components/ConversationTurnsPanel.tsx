"use client";

import type { DemoConversationTurn } from "@/lib/types";

type ConversationTurnsPanelProps = {
  turns: DemoConversationTurn[];
};

export function ConversationTurnsPanel({ turns }: ConversationTurnsPanelProps) {
  const extra = turns.filter((t) => typeof t.turn_index === "number" && t.turn_index > 0);
  if (!extra.length) return null;

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-6 shadow-xl shadow-black/30">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Further conversation</h2>
        <p className="text-sm text-zinc-400">
          Extra demo turns reuse episodic memory from prior answers; each row is a fair baseline vs
          memory comparison on that message.
        </p>
      </div>
      <ol className="space-y-6">
        {extra.map((turn) => (
          <li
            key={turn.turn_index}
            className="rounded-xl border border-white/[0.06] bg-black/25 p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/[0.06] pb-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Follow-up #{(turn.turn_index ?? 0) + 2}
              </span>
              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/25">
                Δ {(turn.improvement ?? 0) >= 0 ? "+" : ""}
                {turn.improvement ?? 0} pts · headroom {(turn.improvement_headroom_pct ?? 0)}%
              </span>
            </div>
            <p className="mt-3 text-sm font-medium text-zinc-200">{turn.query}</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <div className="text-[11px] font-semibold uppercase text-zinc-500">
                  Fair baseline score {turn.score_followup_baseline ?? 0}/30
                </div>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-zinc-400">
                  {turn.followup_baseline_answer || "—"}
                </p>
              </div>
              <div className="rounded-lg border border-teal-500/20 bg-teal-950/30 p-3">
                <div className="text-[11px] font-semibold uppercase text-teal-200/90">
                  With memory score {turn.score_with_memory ?? 0}/30
                </div>
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-zinc-100">
                  {turn.answer_with_memory || "—"}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
