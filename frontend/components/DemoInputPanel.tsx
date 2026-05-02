"use client";

type DemoInputPanelProps = {
  initialQuery: string;
  followUpQuery: string;
  userId: string;
  loading: boolean;
  onInitialChange: (value: string) => void;
  onFollowUpChange: (value: string) => void;
  onUserIdChange: (value: string) => void;
  onRun: () => void;
};

export function DemoInputPanel({
  initialQuery,
  followUpQuery,
  userId,
  loading,
  onInitialChange,
  onFollowUpChange,
  onUserIdChange,
  onRun,
}: DemoInputPanelProps) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-6 shadow-xl shadow-black/30">
      <div className="mb-4 flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-white">Demo input</h2>
        <p className="text-sm text-zinc-400">
          After your first follow-up, the API automatically runs{" "}
          <span className="text-zinc-300">four preset turns</span> with layered, multi-part questions
          (documents & timing tensions, salary/SOC/pro-rata, English evidence edge cases, dependants &
          entry sequencing) so retrieval and episodic continuity are stressed—no manual setup. Execution
          streams live.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
          Opening message
          <textarea
            className="min-h-[96px] rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-sm font-normal text-zinc-100 shadow-inner outline-none ring-teal-500/0 transition focus:border-teal-500/40 focus:ring-2 focus:ring-teal-500/15"
            value={initialQuery}
            onChange={(event) => onInitialChange(event.target.value)}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
          First follow-up (fair comparison turn)
          <textarea
            className="min-h-[96px] rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-sm font-normal text-zinc-100 shadow-inner outline-none ring-teal-500/0 transition focus:border-teal-500/40 focus:ring-2 focus:ring-teal-500/15"
            value={followUpQuery}
            onChange={(event) => onFollowUpChange(event.target.value)}
          />
        </label>
      </div>
      <label className="mt-4 flex flex-col gap-2 text-sm font-medium text-zinc-300">
        User ID
        <input
          className="rounded-xl border border-white/[0.08] bg-black/30 px-3 py-2 text-sm font-normal text-zinc-100 shadow-inner outline-none ring-teal-500/0 transition focus:border-teal-500/40 focus:ring-2 focus:ring-teal-500/15"
          value={userId}
          onChange={(event) => onUserIdChange(event.target.value)}
        />
      </label>
      <p className="mt-2 text-[11px] text-zinc-600">
        Synced with the sidebar session ID unless you override here for this demo only.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onRun}
          disabled={loading}
          className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/30 transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:shadow-none"
        >
          {loading ? "Streaming harness…" : "Run demo (live stream)"}
        </button>
        <span className="text-xs text-zinc-500">
          Longer run (~1–3 min) — preset turns invoke full agent stack each time.
        </span>
      </div>
    </section>
  );
}
