"use client";

type BeforeAfterPanelProps = {
  /** Fair control: same follow-up text and same GOV.UK slices; memories cleared. */
  answerFairBaseline: string;
  scoreFairBaseline: number;
  answerWithMemory: string;
  scoreWithMemory: number;
  improvement: number;
  /** Percent of rubric headroom (to 30) captured by the lift; capped at 100. */
  improvementHeadroomPct: number;
};

export function BeforeAfterPanel({
  answerFairBaseline,
  scoreFairBaseline,
  answerWithMemory,
  scoreWithMemory,
  improvement,
  improvementHeadroomPct,
}: BeforeAfterPanelProps) {
  const hasAny =
    answerFairBaseline.length > 0 ||
    answerWithMemory.length > 0 ||
    scoreFairBaseline > 0 ||
    scoreWithMemory > 0;

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-6 shadow-xl shadow-black/30">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Fair comparison on follow-up</h2>
          <p className="text-sm text-zinc-400">
            Same user message and identical retrieved GOV.UK text — only semantic/episodic memory
            differs. This isolates memory impact (not question difficulty).
          </p>
        </div>
        {hasAny && (
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <div className="rounded-full bg-emerald-500/15 px-4 py-2 text-center text-sm font-semibold text-emerald-200 ring-1 ring-emerald-400/25">
              Δ {improvement >= 0 ? "+" : ""}
              {improvement} pts vs fair baseline
            </div>
            <div className="rounded-full bg-white/[0.06] px-4 py-2 text-center text-xs font-semibold text-zinc-200 ring-1 ring-white/[0.08]">
              Headroom captured: {improvementHeadroomPct}%
              <span className="ml-1 font-normal text-zinc-500">(toward 30/30)</span>
            </div>
          </div>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="flex h-full flex-col rounded-xl border border-white/[0.06] bg-black/25 p-4">
          <header className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Memory off (control)
            </h3>
            <span className="rounded-md bg-white/[0.06] px-2 py-1 text-xs font-semibold text-zinc-200 ring-1 ring-white/[0.08]">
              Score {scoreFairBaseline}/30
            </span>
          </header>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
            {answerFairBaseline || "Run the demo to populate this panel."}
          </p>
        </article>
        <article className="flex h-full flex-col rounded-xl border border-teal-500/25 bg-teal-950/40 p-4 ring-1 ring-teal-500/15">
          <header className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-teal-200/90">
              Adaptive memory on
            </h3>
            <span className="rounded-md bg-teal-600 px-2 py-1 text-xs font-semibold text-white shadow-sm">
              Score {scoreWithMemory}/30
            </span>
          </header>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-100">
            {answerWithMemory || "Adaptive retrieval enriches this answer on the same question."}
          </p>
        </article>
      </div>
    </section>
  );
}
