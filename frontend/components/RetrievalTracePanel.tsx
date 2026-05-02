"use client";

import type { RetrievalTrace } from "@/lib/types";

export type { RetrievalTrace };

type RetrievalTracePanelProps = {
  trace: RetrievalTrace | null;
};

export function RetrievalTracePanel({ trace }: RetrievalTracePanelProps) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-6 shadow-xl shadow-black/30">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Why this is adaptive retrieval</h2>
        <p className="text-sm text-zinc-400">
          The retrieval agent blends GOV.UK grounding with boosted semantic memories, episodic context, and
          evaluator-aware weights. When present, same-turn tone markers and visa-topic hints inform the rationale.
        </p>
      </div>
      {!trace || Object.keys(trace).length === 0 ? (
        <p className="text-sm text-zinc-500">Adaptive trace appears after the demo completes.</p>
      ) : (
        <div className="space-y-4 text-sm text-zinc-200">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/[0.06] bg-black/25 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Strategy
              </div>
              <div className="mt-1 font-medium text-white">{trace.strategy}</div>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-black/25 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Sources counted
              </div>
              <ul className="mt-2 space-y-1 text-zinc-400">
                <li>GOV.UK chunks: {trace.govuk_chunks_found ?? 0}</li>
                <li>Semantic memories: {trace.semantic_memories_found ?? 0}</li>
                <li>Episodic memories: {trace.episodic_memories_found ?? 0}</li>
              </ul>
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Weight profile
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {trace.weights &&
                Object.entries(trace.weights).map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-lg border border-teal-500/25 bg-teal-500/10 px-3 py-2 text-sm font-semibold text-teal-100"
                  >
                    <div className="text-[11px] uppercase tracking-wide text-teal-200/80">{key}</div>
                    <div>{Number(value).toFixed(2)}</div>
                  </div>
                ))}
            </div>
          </div>
          {(trace.turn_tone_markers?.length ||
            trace.turn_intent_hints?.length ||
            trace.turn_situation_hints?.length) ? (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {trace.turn_situation_hints && trace.turn_situation_hints.length > 0 && (
                <div className="rounded-xl border border-amber-500/25 bg-amber-950/25 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-200/90">
                    Situation cues (this message)
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {trace.turn_situation_hints.map((m) => (
                      <span
                        key={m}
                        className="rounded-md border border-amber-500/30 bg-black/30 px-2 py-0.5 text-[11px] text-amber-100/90"
                      >
                        {m.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {trace.turn_tone_markers && trace.turn_tone_markers.length > 0 && (
                <div className="rounded-xl border border-violet-500/20 bg-violet-950/20 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-violet-300/90">
                    Tone markers (this message)
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {trace.turn_tone_markers.map((m) => (
                      <span
                        key={m}
                        className="rounded-md border border-violet-500/25 bg-black/30 px-2 py-0.5 text-[11px] text-violet-100/90"
                      >
                        {m.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {trace.turn_intent_hints && trace.turn_intent_hints.length > 0 && (
                <div className="rounded-xl border border-white/[0.06] bg-black/25 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Visa-topic hints (retrieval)
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {trace.turn_intent_hints.map((m) => (
                      <span
                        key={m}
                        className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[11px] text-zinc-300"
                      >
                        {m.replace(/_/g, " ")}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
          {(typeof trace.govuk_top_k === "number" || typeof trace.prior_answer_accuracy === "number") && (
            <div className="rounded-xl border border-white/[0.06] bg-black/25 p-3 text-xs text-zinc-400">
              {typeof trace.govuk_top_k === "number" && (
                <div>
                  GOV.UK top_k: <span className="font-semibold text-zinc-200">{trace.govuk_top_k}</span>
                </div>
              )}
              {typeof trace.prior_answer_accuracy === "number" && (
                <div className="mt-1">
                  Prior accuracy (baseline):{" "}
                  <span className="font-semibold text-zinc-200">{trace.prior_answer_accuracy}</span>/5
                </div>
              )}
              {trace.govuk_top_k_rationale && (
                <p className="mt-2 leading-relaxed text-zinc-500">{trace.govuk_top_k_rationale}</p>
              )}
            </div>
          )}
          {(trace.programmatic_reason || trace.llm_reason) && (
            <div className="space-y-2 rounded-xl border border-white/[0.06] bg-black/30 p-3 text-sm leading-relaxed text-zinc-300 shadow-inner">
              {trace.programmatic_reason && (
                <p>
                  <span className="font-semibold text-teal-200/90">Programmatic: </span>
                  {trace.programmatic_reason}
                </p>
              )}
              {trace.llm_reason && (
                <p>
                  <span className="font-semibold text-white">LLM rationale: </span>
                  {trace.llm_reason}
                </p>
              )}
            </div>
          )}
          <div className="rounded-xl border border-white/[0.06] bg-black/30 p-3 text-sm leading-relaxed text-zinc-300 shadow-inner">
            <span className="font-semibold text-white">Combined reason: </span>
            {trace.reason}
          </div>
        </div>
      )}
    </section>
  );
}
