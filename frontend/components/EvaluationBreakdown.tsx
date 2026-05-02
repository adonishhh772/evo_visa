"use client";

import { ScoreCard } from "./ScoreCard";

type Evaluation = Record<string, unknown>;

const DIMENSIONS = [
  "accuracy",
  "completeness",
  "clarity",
  "personalisation",
  "actionability",
  "safety",
] as const;

function pickDimension(source: Evaluation | undefined, key: string): number {
  if (!source) return 0;
  const raw = source[key];
  const numeric = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(numeric) ? numeric : 0;
}

type EvaluationBreakdownProps = {
  before?: Evaluation;
  after?: Evaluation;
  beforeLabel?: string;
  afterLabel?: string;
};

export function EvaluationBreakdown({
  before,
  after,
  beforeLabel = "Before memory",
  afterLabel = "After adaptive memory",
}: EvaluationBreakdownProps) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-6 shadow-xl shadow-black/30">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Evaluation breakdown</h2>
        <p className="text-sm text-zinc-400">
          Six dimensions scored 0–5. Totals align with the evaluator&apos;s 0–30 aggregate.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-zinc-300">{beforeLabel}</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {DIMENSIONS.map((dimension) => (
              <ScoreCard
                key={`before-${dimension}`}
                label={dimension}
                value={pickDimension(before, dimension)}
              />
            ))}
          </div>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold text-teal-200/90">{afterLabel}</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {DIMENSIONS.map((dimension) => (
              <ScoreCard
                key={`after-${dimension}`}
                label={dimension}
                value={pickDimension(after, dimension)}
                accent
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
