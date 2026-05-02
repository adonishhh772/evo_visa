"use client";

type SemanticRow = {
  memory_id?: string;
  situation?: string;
  learned_strategy?: string;
  tags?: string[];
  source_query?: string;
};

type EpisodicRow = {
  interaction_id?: string;
  user_id?: string;
  query?: string;
  answer?: string;
  score?: number;
  memories_used?: string[];
  created_at?: string;
};

export type DemoMemoryInventory = {
  note?: string;
  semantic_store_count?: number;
  episodic_store_count?: number;
  semantic_records?: SemanticRow[];
  episodic_records?: EpisodicRow[];
};

type DemoMemoryInventoryPanelProps = {
  inventory: DemoMemoryInventory | null;
};

function clip(s: string, max: number) {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function DemoMemoryInventoryPanel({ inventory }: DemoMemoryInventoryPanelProps) {
  const semantic = (inventory?.semantic_records ?? []) as SemanticRow[];
  const episodic = (inventory?.episodic_records ?? []) as EpisodicRow[];

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-6 shadow-xl shadow-black/30">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">Full memory inventory (demo)</h2>
        <p className="text-sm text-zinc-400">
          Everything stored that can influence retrieval—not only the ranked{" "}
          <span className="font-mono text-zinc-300">retrieved_memories</span> slice for this follow-up.
        </p>
        {inventory?.note ? (
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">{inventory.note}</p>
        ) : null}
      </div>

      {!inventory || (semantic.length === 0 && episodic.length === 0) ? (
        <p className="text-sm text-zinc-500">
          Run the demo to load inventory (semantic strategies + episodic rows for this user).
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">Semantic store</h3>
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-zinc-400">
                {inventory.semantic_store_count ?? semantic.length} rows
              </span>
            </div>
            <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1 text-sm">
              {semantic.map((row) => (
                <li
                  key={row.memory_id || `${row.situation}-${row.learned_strategy}`}
                  className="rounded-lg border border-white/[0.06] bg-black/25 p-3"
                >
                  <div className="font-mono text-[10px] text-zinc-500">{row.memory_id}</div>
                  <p className="mt-1 font-medium text-zinc-200">{clip(row.situation || "", 160)}</p>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                    {clip(row.learned_strategy || "", 280)}
                  </p>
                  {(row.tags?.length ?? 0) > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(row.tags || []).map((tag) => (
                        <span
                          key={tag}
                          className="rounded border border-white/[0.06] px-1.5 py-0.5 text-[10px] text-zinc-500"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">Episodic (this user)</h3>
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-zinc-400">
                {inventory.episodic_store_count ?? episodic.length} rows
              </span>
            </div>
            <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1 text-sm">
              {episodic.map((row) => (
                <li
                  key={row.interaction_id || row.query}
                  className="rounded-lg border border-amber-500/15 bg-amber-950/10 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-500">
                    <span className="font-mono">{row.interaction_id}</span>
                    <span>
                      score {row.score ?? "—"}
                      {row.created_at ? ` · ${row.created_at}` : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-zinc-200">{clip(row.query || "", 200)}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                    {clip(row.answer || "", 220)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
