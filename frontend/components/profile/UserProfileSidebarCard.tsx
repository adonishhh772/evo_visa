"use client";

import { useUserProfile } from "./UserProfileContext";

function ukPresenceLabel(raw: string | undefined): string {
  const v = (raw || "unknown").toLowerCase();
  if (v === "outside_uk") return "Outside UK — applying from abroad";
  if (v === "inside_uk") return "Inside UK — in-country context";
  return "Not stated yet";
}

function ChipList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) {
    return <p className="text-[10px] italic text-zinc-600">{empty}</p>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((t) => (
        <span
          key={t}
          className="rounded-md border border-violet-500/20 bg-violet-950/30 px-1.5 py-0.5 text-[10px] text-violet-200/90"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

export function UserProfileSidebarCard() {
  const { profile, loading, reloadProfile } = useUserProfile();

  const bullets = Array.isArray(profile?.persona_bullets) ? (profile!.persona_bullets as string[]) : [];
  const topics = Array.isArray(profile?.topic_tags) ? (profile!.topic_tags as string[]) : [];
  const tones = Array.isArray(profile?.tone_history) ? (profile!.tone_history as string[]) : [];
  const psych = Array.isArray(profile?.psychological_notes)
    ? (profile!.psychological_notes as string[])
    : [];
  const style =
    profile && typeof profile.preferred_style === "string" ? profile.preferred_style.replace(/_/g, " ") : "";
  const goal = profile?.goal != null && String(profile.goal).trim() ? String(profile.goal) : "";
  const ukPresence =
    profile && typeof profile.uk_presence === "string" ? profile.uk_presence : "unknown";
  const nationality =
    profile?.nationality != null && String(profile.nationality).trim()
      ? String(profile.nationality)
      : "";
  const location =
    profile?.current_location != null && String(profile.current_location).trim()
      ? String(profile.current_location)
      : "";
  const facts = Array.isArray(profile?.mentioned_facts) ? (profile!.mentioned_facts as string[]) : [];
  const turns =
    profile && typeof profile.interaction_count === "number"
      ? profile.interaction_count
      : Number(profile?.interaction_count ?? 0);

  return (
    <div className="border-t border-white/[0.06] px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-300/90">Your profile</p>
          <p className="mt-0.5 text-[10px] leading-snug text-zinc-600">
            Situation, <span className="text-zinc-400">preferences</span> (how answers should feel), tone, and facts —
            stored in <span className="font-mono text-zinc-500">user_profiles</span>, updated after each reply.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reloadProfile()}
          disabled={loading}
          className="shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-zinc-300 transition hover:bg-white/[0.08] disabled:opacity-40"
        >
          {loading ? "…" : "Refresh"}
        </button>
      </div>

      {loading && profile === undefined ? (
        <p className="mt-3 text-[11px] text-zinc-500">Loading…</p>
      ) : profile === null ? (
        <p className="mt-3 text-[11px] text-zinc-500">
          Could not reach the profile API. Is the backend running?
        </p>
      ) : (
        <div className="mt-3 max-h-[min(52vh,420px)] space-y-3 overflow-y-auto pr-1 text-[11px] leading-relaxed text-zinc-300">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Where they are (for answers)
            </p>
            <p className="mt-0.5 text-zinc-100">{ukPresenceLabel(ukPresence)}</p>
            {nationality ? (
              <p className="mt-1 text-zinc-400">
                <span className="text-zinc-500">Nationality / stated — </span>
                {nationality}
              </p>
            ) : (
              <p className="mt-1 text-[10px] text-zinc-600">Nationality — not stated.</p>
            )}
            {location ? (
              <p className="mt-1 text-zinc-400">
                <span className="text-zinc-500">Location summary — </span>
                {location}
              </p>
            ) : null}
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Stated facts we remember</p>
            {facts.length ? (
              <ul className="mt-1 list-disc space-y-1 pl-3.5 text-zinc-400">
                {facts.slice(-8).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[10px] italic text-zinc-600">
                Mention things like “I’m outside the UK” — we’ll persist and adapt follow-ups.
              </p>
            )}
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Goal</p>
            <p className="mt-0.5 text-zinc-200">{goal || "— Not inferred yet"}</p>
          </div>

          <div className="rounded-lg border border-teal-500/20 bg-teal-950/20 px-2.5 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-300/90">
              Answer preferences
            </p>
            <p className="mt-1 text-[10px] text-zinc-500">
              The assistant is instructed to follow these on every reply (from your wording + profile learning).
            </p>
            <p className="mt-1.5 text-zinc-200">
              <span className="text-zinc-500">Style — </span>
              {style ? (
                <span className="capitalize">{style}</span>
              ) : (
                <span className="text-zinc-500">Default (clear steps). Say e.g. “keep it short” or “more detail”.</span>
              )}
            </p>
            <div className="mt-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                Reply prefs <span className="font-normal normal-case text-zinc-600">(persona bullets)</span>
              </p>
              {bullets.length ? (
                <ul className="mt-1 list-disc space-y-1 pl-3.5 text-zinc-300">
                  {bullets.slice(-8).map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-[10px] italic text-zinc-600">
                  None yet — e.g. checklists, plain English, no jargon.
                </p>
              )}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Chat turns logged <span className="font-normal normal-case text-zinc-600">(profile learning)</span>
            </p>
            <p className="mt-0.5 font-mono text-teal-200/80">{turns}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Tone & stance trail <span className="font-normal normal-case text-zinc-600">(inferred)</span>
            </p>
            <div className="mt-1">
              <ChipList
                items={tones.slice(-12).map((t) => t.replace(/_/g, " "))}
                empty="None yet — how you write builds this."
              />
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Psychological / relational notes
            </p>
            {psych.length ? (
              <ul className="mt-1 list-disc space-y-1 pl-3.5 text-zinc-400">
                {psych.slice(-6).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[10px] italic text-zinc-600">None yet — inferred gently over time.</p>
            )}
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              Visa topic tags <span className="font-normal normal-case text-zinc-600">(secondary)</span>
            </p>
            <div className="mt-1">
              <ChipList items={topics.slice(-12)} empty="None yet." />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
