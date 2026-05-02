"use client";

import { useEffect, useRef } from "react";
import type { DemoStreamEvent } from "@/lib/types";

type DemoLiveExecutionProps = {
  events: DemoStreamEvent[];
  streaming: boolean;
};

function proofSummary(ev: DemoStreamEvent): string {
  const proof = ev.proof;
  if (!proof || typeof proof !== "object") return "";
  if ("chunk_count" in proof && typeof proof.chunk_count === "number") {
    return `${proof.chunk_count} chunks`;
  }
  if ("total_score" in proof && typeof proof.total_score === "number") {
    return `score ${proof.total_score}/30`;
  }
  if ("chars" in proof && typeof proof.chars === "number") {
    return `${proof.chars} chars`;
  }
  if ("memory_id" in proof) return "memory persisted";
  if ("improvement" in proof) return `Δ ${proof.improvement}`;
  return "";
}

export function DemoLiveExecution({ events, streaming }: DemoLiveExecutionProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [events.length, streaming]);

  if (!events.length && !streaming) {
    return (
      <section className="rounded-2xl border border-white/[0.06] border-dashed bg-zinc-950/40 p-6 text-sm text-zinc-500">
        Run the demo to stream agent steps here as they execute (retrieval, answers, evaluation,
        reflection, persistence).
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-teal-500/20 bg-[#070708] p-4 shadow-inner shadow-black/40">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-white">Live execution log</h2>
          <p className="text-xs text-zinc-500">
            Server-Sent Events — each line is emitted when that step finishes (not batched at the
            end).
          </p>
        </div>
        {streaming && (
          <span className="flex items-center gap-2 rounded-full bg-teal-500/15 px-3 py-1 text-xs font-semibold text-teal-200 ring-1 ring-teal-400/30">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-400" />
            </span>
            Running
          </span>
        )}
      </div>
      <div className="max-h-[min(420px,50vh)] overflow-y-auto rounded-xl border border-white/[0.06] bg-black/40 font-mono text-[11px] leading-relaxed text-zinc-300">
        <ul className="divide-y divide-white/[0.04]">
          {events
            .filter((ev) => ev.type !== "transcript")
            .map((ev, i) => {
            const seq = ev.seq ?? i + 1;
            if (ev.type === "run_started") {
              return (
                <li key={`${seq}-start`} className="px-3 py-2 text-teal-200/90">
                  <span className="text-zinc-600">#{seq}</span> run_started ·{" "}
                  {ev.preset_turns_used ? "preset multi-turn" : "custom extras"} ·{" "}
                  {(ev.follow_chain?.length ?? 0) + 1} user messages total (incl. opening)
                </li>
              );
            }
            if (ev.type === "turn_started") {
              return (
                <li key={`${seq}-turn`} className="bg-white/[0.03] px-3 py-2 font-sans text-xs font-semibold text-white">
                  <span className="text-zinc-600">#{seq}</span> Turn {(ev.turn_index ?? 0) + 1}:{" "}
                  <span className="font-normal text-zinc-300">{ev.query}</span>
                </li>
              );
            }
            if (ev.type === "step_begin") {
              const ti = ev.turn_index;
              return (
                <li key={`${seq}-b-${ev.step_id}`} className="px-3 py-1.5 text-zinc-500">
                  <span className="text-zinc-600">#{seq}</span> … {ev.title}
                  {ti !== undefined ? ` · turn ${ti + 1}` : ""}{" "}
                  <span className="text-zinc-600">({ev.agent})</span>
                </li>
              );
            }
            if (ev.type === "step_end") {
              const sum = proofSummary(ev);
              const ti = ev.turn_index;
              return (
                <li key={`${seq}-e-${ev.step_id}`} className="px-3 py-1.5 text-emerald-200/85">
                  <span className="text-zinc-600">#{seq}</span> ✓ {ev.step_id}
                  {ti !== undefined ? ` · turn ${ti + 1}` : ""}
                  {sum ? ` · ${sum}` : ""}
                </li>
              );
            }
            if (ev.type === "done") {
              return (
                <li key={`${seq}-done`} className="px-3 py-2 font-sans text-xs font-semibold text-emerald-300">
                  <span className="text-zinc-600">#{seq}</span> done — full payload synced to summary
                  panels below
                </li>
              );
            }
            if (ev.type === "error") {
              return (
                <li key={`${seq}-err`} className="px-3 py-2 text-red-300">
                  <span className="text-zinc-600">#{seq}</span> error · {String(ev.detail ?? "")}
                </li>
              );
            }
            return (
              <li key={`${seq}-misc-${i}`} className="px-3 py-1 text-zinc-600">
                <span className="text-zinc-600">#{seq}</span> {ev.type}
              </li>
            );
          })}
        </ul>
        <div ref={bottomRef} />
      </div>
    </section>
  );
}
