"use client";

type LearnedMemory = {
  situation?: string;
  learned_strategy?: string;
  tags?: string[];
  source_query?: string;
};

type LearnedMemoryPanelProps = {
  memory: LearnedMemory | null;
};

export function LearnedMemoryPanel({ memory }: LearnedMemoryPanelProps) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-6 shadow-xl shadow-black/30">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">What the agent learned</h2>
        <p className="text-sm text-zinc-400">
          Reflection converts evaluator gaps into a compact semantic memory stored in MongoDB.
        </p>
      </div>
      {!memory || Object.keys(memory).length === 0 ? (
        <p className="text-sm text-zinc-500">Run the demo to materialise a fresh memory.</p>
      ) : (
        <dl className="space-y-3 text-sm text-zinc-200">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Situation
            </dt>
            <dd className="mt-1 whitespace-pre-wrap">{memory.situation}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Learned strategy
            </dt>
            <dd className="mt-1 whitespace-pre-wrap">{memory.learned_strategy}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Tags</dt>
            <dd className="mt-1 flex flex-wrap gap-2">
              {(memory.tags || []).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/[0.08] bg-black/30 px-3 py-1 text-xs font-medium text-zinc-300"
                >
                  {tag}
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Source query
            </dt>
            <dd className="mt-1 whitespace-pre-wrap text-zinc-400">{memory.source_query}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
