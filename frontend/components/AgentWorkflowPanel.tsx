"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { WorkflowPhase, WorkflowStep } from "@/lib/types";

type AgentWorkflowPanelProps = {
  steps: WorkflowStep[];
};

const PHASE_LABEL: Record<WorkflowPhase, string> = {
  baseline: "Baseline turn",
  learning: "Learning",
  adaptive: "Adaptive turn",
  outcome: "Outcome",
};

const PHASE_RING: Record<WorkflowPhase, string> = {
  baseline: "border-sky-500/40 bg-sky-500/15 text-sky-200",
  learning: "border-amber-500/40 bg-amber-500/15 text-amber-100",
  adaptive: "border-teal-500/40 bg-teal-500/15 text-teal-100",
  outcome: "border-emerald-500/40 bg-emerald-500/15 text-emerald-100",
};

function TraceMini({ trace }: { trace: Record<string, unknown> }) {
  const prog = trace.programmatic_reason;
  const llm = trace.llm_reason;
  const topK = trace.govuk_top_k;
  const acc = trace.prior_answer_accuracy;
  const rat = trace.govuk_top_k_rationale;

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-white/[0.06] bg-black/35 p-3 text-xs text-zinc-300">
      {(typeof topK === "number" || typeof acc === "number") && (
        <div className="flex flex-wrap gap-3 text-zinc-400">
          {typeof topK === "number" && (
            <span>
              GOV.UK top_k: <span className="font-semibold text-zinc-200">{topK}</span>
            </span>
          )}
          {typeof acc === "number" && (
            <span>
              Prior accuracy signal: <span className="font-semibold text-zinc-200">{acc}</span>/5
            </span>
          )}
        </div>
      )}
      {typeof rat === "string" && rat.length > 0 && (
        <p className="leading-relaxed text-zinc-400">
          <span className="font-semibold text-zinc-300">Recall rule: </span>
          {rat}
        </p>
      )}
      {typeof prog === "string" && prog.length > 0 && (
        <p className="leading-relaxed">
          <span className="font-semibold text-teal-200/90">Programmatic weights: </span>
          {prog}
        </p>
      )}
      {typeof llm === "string" && llm.length > 0 && (
        <p className="leading-relaxed">
          <span className="font-semibold text-zinc-200">LLM retrieval rationale: </span>
          {llm}
        </p>
      )}
    </div>
  );
}

function DetailBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-black/25 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-2 text-xs leading-relaxed text-zinc-300">{children}</div>
    </div>
  );
}

function renderDetails(details: Record<string, unknown> | undefined, stepId: string) {
  if (!details || typeof details !== "object") return null;

  if (stepId === "a1" && details.trace && typeof details.trace === "object") {
    const trace = details.trace as Record<string, unknown>;
    const weights = trace.weights;
    return (
      <div className="space-y-3">
        <TraceMini trace={trace} />
        {weights && typeof weights === "object" && (
          <DetailBlock label="Weight profile">
            <ul className="grid gap-1 sm:grid-cols-3">
              {Object.entries(weights as Record<string, number>).map(([k, v]) => (
                <li key={k} className="flex justify-between gap-2 rounded bg-white/[0.03] px-2 py-1">
                  <span className="text-zinc-500">{k}</span>
                  <span className="font-mono text-zinc-200">{Number(v).toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </DetailBlock>
        )}
        {Array.isArray(details.top_semantic_preview) && details.top_semantic_preview.length > 0 && (
          <DetailBlock label="Top semantic picks (why ranked)">
            <ul className="space-y-2">
              {(details.top_semantic_preview as Record<string, unknown>[]).map((row, i) => (
                <li key={i} className="rounded border border-white/[0.05] bg-black/20 p-2">
                  <div className="font-mono text-[11px] text-zinc-500">{String(row.memory_id || "")}</div>
                  <div className="mt-1 text-zinc-200">{String(row.situation || "")}</div>
                  <div className="mt-1 text-zinc-500">{String(row.selection_reason || "")}</div>
                </li>
              ))}
            </ul>
          </DetailBlock>
        )}
      </div>
    );
  }

  const previewKeys = ["answer_preview", "evaluator_note", "situation", "learned_strategy", "query"];
  const blocks: ReactNode[] = [];

  if (typeof details.total_score === "number") {
    blocks.push(
      <DetailBlock key="total_score" label="Total score (max 30)">
        <span className="text-lg font-semibold text-white">{details.total_score}</span>
      </DetailBlock>,
    );
  }

  for (const key of previewKeys) {
    const val = details[key];
    if (typeof val === "string" && val.trim()) {
      blocks.push(
        <DetailBlock key={key} label={key.replace(/_/g, " ")}>
          {val}
        </DetailBlock>,
      );
    }
  }

  const titles = details.titles;
  if (Array.isArray(titles) && titles.length > 0) {
    blocks.push(
      <DetailBlock key="titles" label="Sources (titles)">
        <ol className="list-decimal space-y-1 pl-4">
          {(titles as string[]).map((t, i) => (
            <li key={i}>{t || "(untitled)"}</li>
          ))}
        </ol>
      </DetailBlock>,
    );
  }

  const dims = ["accuracy", "completeness", "clarity", "personalisation", "actionability", "safety"];
  const hasDims = dims.some((d) => typeof details[d] === "number");
  if (hasDims) {
    blocks.push(
      <DetailBlock key="dims" label="Rubric dimensions (0–5)">
        <ul className="grid gap-1 sm:grid-cols-2 md:grid-cols-3">
          {dims.map((d) =>
            typeof details[d] === "number" ? (
              <li key={d} className="flex justify-between gap-2 rounded bg-white/[0.03] px-2 py-1">
                <span className="capitalize text-zinc-500">{d}</span>
                <span className="font-mono text-zinc-200">{Number(details[d])}</span>
              </li>
            ) : null,
          )}
        </ul>
      </DetailBlock>,
    );
  }

  const missing = details.missing_points;
  if (Array.isArray(missing) && missing.length > 0) {
    blocks.push(
      <DetailBlock key="missing" label="Missing / gaps">
        <ul className="list-disc space-y-1 pl-4">
          {(missing as string[]).map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      </DetailBlock>,
    );
  }

  const tags = details.tags;
  if (Array.isArray(tags) && tags.length > 0) {
    blocks.push(
      <DetailBlock key="tags" label="Tags">
        <div className="flex flex-wrap gap-1.5">
          {(tags as string[]).map((t) => (
            <span key={t} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-zinc-300">
              {t}
            </span>
          ))}
        </div>
      </DetailBlock>,
    );
  }

  const mids = details.memories_used_ids;
  if (Array.isArray(mids) && mids.length > 0) {
    blocks.push(
      <DetailBlock key="mids" label="Memory IDs credited">
        <div className="flex flex-wrap gap-1 font-mono text-[11px] text-zinc-400">
          {(mids as string[]).map((id) => (
            <span key={id}>{id}</span>
          ))}
        </div>
      </DetailBlock>,
    );
  }

  if (blocks.length === 0) return null;
  return <div className="space-y-3">{blocks}</div>;
}

export function AgentWorkflowPanel({ steps }: AgentWorkflowPanelProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const map = new Map<WorkflowPhase, WorkflowStep[]>();
    for (const s of steps) {
      const list = map.get(s.phase) || [];
      list.push(s);
      map.set(s.phase, list);
    }
    return map;
  }, [steps]);

  const phaseOrder: WorkflowPhase[] = ["baseline", "learning", "adaptive", "outcome"];

  if (!steps.length) {
    return (
      <section className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-6 shadow-xl shadow-black/30">
        <h2 className="text-lg font-semibold text-white">Agentic workflow</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Run the demo to see each agent stage: retrieval, consultant, evaluator, reflection, adaptive
          orchestration, and persistence.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-6 shadow-xl shadow-black/30">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-white">Agentic workflow</h2>
        <p className="mt-1 text-sm text-zinc-400">
          End-to-end harness: baseline answer → evaluation → reflection memory → adaptive retrieval
          decisions → second answer → scoring delta → episodic log.
        </p>
      </div>

      <div className="space-y-10">
        {phaseOrder.map((phase) => {
          const items = grouped.get(phase);
          if (!items?.length) return null;
          return (
            <div key={phase}>
              <div className="mb-4 flex items-center gap-3">
                <span
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${PHASE_RING[phase]}`}
                >
                  {PHASE_LABEL[phase]}
                </span>
                <div className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
              </div>
              <ol className="relative space-y-4 border-l border-white/[0.08] pl-6">
                {items.map((step) => {
                  const expanded = open[step.id] ?? step.phase === "outcome";
                  return (
                    <li key={step.id} className="relative">
                      <span className="absolute -left-[29px] top-2 h-2.5 w-2.5 rounded-full border border-white/20 bg-zinc-800 ring-4 ring-[#0c0c0e]" />
                      <div className="rounded-xl border border-white/[0.06] bg-black/30 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                              {step.agent}
                            </div>
                            <h3 className="mt-1 text-base font-semibold text-white">{step.title}</h3>
                            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{step.summary}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setOpen((prev) => ({ ...prev, [step.id]: !expanded }))}
                            className="shrink-0 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.08]"
                          >
                            {expanded ? "Hide detail" : "Show decisions"}
                          </button>
                        </div>
                        {expanded && step.details && (
                          <div className="mt-4 border-t border-white/[0.06] pt-4">
                            {renderDetails(step.details as Record<string, unknown>, step.id)}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>
    </section>
  );
}
