"use client";

type ScoreCardProps = {
  label: string;
  value: number;
  accent?: boolean;
};

export function ScoreCard({ label, value, accent }: ScoreCardProps) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        accent
          ? "border-teal-500/30 bg-teal-500/10 text-teal-50"
          : "border-white/[0.08] bg-black/25 text-zinc-100"
      }`}
    >
      <div
        className={`text-[11px] font-semibold uppercase tracking-wide ${
          accent ? "text-teal-200/80" : "text-zinc-500"
        }`}
      >
        {label}
      </div>
      <div className="text-xl font-bold">{value}</div>
      <div className={`text-[11px] ${accent ? "text-teal-200/70" : "text-zinc-500"}`}>out of 5</div>
    </div>
  );
}
