"use client";

import { useEffect, useRef } from "react";
import type { DemoStreamEvent } from "@/lib/types";

type DemoProofTranscriptProps = {
  events: DemoStreamEvent[];
  streaming: boolean;
};

export function DemoProofTranscript({ events, streaming }: DemoProofTranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const transcript = events.filter((e) => e.type === "transcript");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript.length, streaming]);

  if (!transcript.length && !streaming) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-6 shadow-xl shadow-black/30">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Proof transcript</h2>
        <p className="text-sm text-zinc-400">
          Chat-style timeline with verifier blocks — expandable JSON for stakeholder demos.
        </p>
      </div>
      <div className="max-h-[min(560px,55vh)] space-y-4 overflow-y-auto pr-1">
        {transcript.map((row, i) => {
          const seq = row.seq ?? i;
          if (row.kind === "user") {
            return (
              <div key={`${seq}-u`} className="flex justify-end">
                <div className="max-w-[90%] rounded-2xl rounded-br-md bg-zinc-700/80 px-4 py-3 text-sm text-zinc-100">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                    {row.turn_label}
                  </div>
                  {row.text}
                </div>
              </div>
            );
          }
          if (row.kind === "assistant") {
            const mem = row.meta?.memory === true;
            return (
              <div key={`${seq}-a`} className="flex justify-start">
                <div
                  className={`max-w-[92%] rounded-2xl rounded-bl-md px-4 py-3 text-sm leading-relaxed ${
                    mem
                      ? "border border-teal-500/25 bg-teal-950/50 text-zinc-100"
                      : "border border-white/[0.08] bg-black/35 text-zinc-300"
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    <span>
                      {row.variant === "fair_baseline"
                        ? "Assistant · fair control"
                        : row.variant === "govuk_only"
                          ? "Assistant · opening (GOV.UK only)"
                          : "Assistant · memory-augmented"}
                    </span>
                    {row.turn_label && <span className="text-zinc-600">{row.turn_label}</span>}
                    {typeof row.meta?.label === "string" && (
                      <span className="font-normal normal-case text-zinc-500">{row.meta.label}</span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap">{row.text}</p>
                </div>
              </div>
            );
          }
          if (row.kind === "proof") {
            return (
              <div key={`${seq}-p`} className="flex justify-center">
                <details className="w-full max-w-2xl rounded-xl border border-amber-500/20 bg-amber-950/20 px-3 py-2 text-left">
                  <summary className="cursor-pointer list-none text-xs font-semibold text-amber-100/90 [&::-webkit-details-marker]:hidden">
                    <span className="text-amber-400/80">⚙</span> {row.title}
                    <span className="ml-2 font-normal text-zinc-500">{row.detail}</span>
                  </summary>
                  {row.proof && (
                    <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-black/40 p-2 text-[10px] text-zinc-400">
                      {JSON.stringify(row.proof, null, 2)}
                    </pre>
                  )}
                </details>
              </div>
            );
          }
          return null;
        })}
        {streaming && (
          <div className="flex justify-center text-xs text-zinc-600">Awaiting next transcript row…</div>
        )}
        <div ref={bottomRef} />
      </div>
    </section>
  );
}
