"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { runChatStream } from "@/lib/api";
import type { ChatApiResponse, DemoStreamEvent } from "@/lib/types";
import { useUserId } from "@/components/layout/UserContext";
import { useUserProfile } from "@/components/profile/UserProfileContext";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: ChatApiResponse;
  error?: string;
  streamEvents?: DemoStreamEvent[];
  streaming?: boolean;
};

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function proofOneLine(proof: Record<string, unknown> | undefined): string {
  if (!proof || typeof proof !== "object") return "";
  if ("total_score" in proof && typeof proof.total_score === "number") {
    return `${proof.total_score}/30`;
  }
  if ("chunk_count" in proof && typeof proof.chunk_count === "number") {
    return `${proof.chunk_count} chunks`;
  }
  if ("chars" in proof && typeof proof.chars === "number") {
    return `${proof.chars} chars`;
  }
  if ("memories_touched" in proof) return `${proof.memories_touched} memories`;
  if ("memory_id" in proof) return "memory written";
  return "";
}

function ChatStreamLog({ events }: { events: DemoStreamEvent[] }) {
  const lines = events.filter((e) => e.type !== "transcript");
  if (!lines.length) return null;

  return (
    <div className="mb-4 rounded-xl border border-teal-500/15 bg-black/35 px-3 py-2 font-mono text-[10px] leading-relaxed text-zinc-400">
      <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-teal-500/80">
        Live execution
      </div>
      <ul className="max-h-40 space-y-1 overflow-y-auto">
        {lines.map((ev, i) => {
          const seq = ev.seq ?? i;
          if (ev.type === "chat_started") {
            return (
              <li key={`${seq}-s`} className="text-teal-200/80">
                #{seq} started · query queued
              </li>
            );
          }
          if (ev.type === "step_begin") {
            return (
              <li key={`${seq}-b-${ev.step_id}`} className="text-zinc-600">
                #{seq} … {ev.title}
              </li>
            );
          }
          if (ev.type === "step_end") {
            const hint = proofOneLine(ev.proof as Record<string, unknown> | undefined);
            return (
              <li key={`${seq}-e-${ev.step_id}`} className="text-emerald-200/75">
                #{seq} ✓ {ev.step_id}
                {hint ? ` · ${hint}` : ""}
              </li>
            );
          }
          if (ev.type === "done") {
            return (
              <li key={`${seq}-d`} className="font-sans text-[10px] font-semibold text-emerald-300/90">
                #{seq} complete
              </li>
            );
          }
          if (ev.type === "profile_refresh") {
            const fields = ev.delta_applied && typeof ev.delta_applied === "object" ? Object.keys(ev.delta_applied) : [];
            return (
              <li key={`${seq}-prof`} className="text-violet-200/85">
                #{seq} profile merged
                {fields.length ? ` · ${fields.join(", ")}` : ""}
              </li>
            );
          }
          return (
            <li key={`${seq}-x`} className="text-zinc-700">
              #{seq} {ev.type}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProofTranscriptInline({ events }: { events: DemoStreamEvent[] }) {
  const proofs = events.filter((e) => e.type === "transcript" && e.kind === "proof");
  if (!proofs.length) return null;
  return (
    <div className="mt-3 space-y-2 border-t border-white/[0.06] pt-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Verifier trail</p>
      {proofs.map((row, i) => (
        <details
          key={`${row.seq ?? i}-p`}
          className="rounded-lg border border-amber-500/15 bg-amber-950/15 px-2 py-1.5"
        >
          <summary className="cursor-pointer text-[11px] text-amber-100/90">
            {row.title}
            <span className="ml-2 font-normal text-zinc-500">{row.detail}</span>
          </summary>
          {row.proof && (
            <pre className="mt-2 max-h-32 overflow-auto text-[9px] text-zinc-500">
              {JSON.stringify(row.proof, null, 2)}
            </pre>
          )}
        </details>
      ))}
    </div>
  );
}

export function ChatExperience() {
  const { userId } = useUserId();
  const { applyProfileSnapshot } = useUserProfile();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !busy, [input, busy]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function handleSend() {
    const text = input.trim();
    if (!text || busy) return;

    const userMessage: ChatMessage = { id: createId(), role: "user", content: text };
    const assistantId = createId();
    const placeholder: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      streamEvents: [],
      streaming: true,
    };

    setMessages((previous) => [...previous, userMessage, placeholder]);
    setInput("");
    setBusy(true);

    try {
      const final = await runChatStream({ user_id: userId, query: text }, (ev) => {
        if (ev.type === "profile_refresh" && ev.profile && typeof ev.profile === "object") {
          applyProfileSnapshot(ev.profile as Record<string, unknown>);
        }
        setMessages((previous) =>
          previous.map((m) =>
            m.id === assistantId
              ? { ...m, streamEvents: [...(m.streamEvents ?? []), ev] }
              : m,
          ),
        );
      });

      if (final.user_profile && typeof final.user_profile === "object") {
        applyProfileSnapshot(final.user_profile as Record<string, unknown>);
      }

      setMessages((previous) =>
        previous.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: final.answer?.trim() || "No answer returned.",
                meta: final,
                streaming: false,
              }
            : m,
        ),
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Request failed.";
      setMessages((previous) =>
        previous.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                streaming: false,
                content:
                  "The EvoVisa backend could not complete this turn. Check the API, MongoDB, and API keys.",
                error: detail,
              }
            : m,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-[#0a0a0c] text-zinc-100">
      <header className="shrink-0 border-b border-white/[0.06] px-5 py-4 md:px-10">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-lg font-semibold tracking-tight text-white md:text-xl">EvoVisa chat</h1>
          <p className="mt-1 text-sm leading-relaxed text-zinc-500">
            Plain-language Skilled Worker guidance: the model adapts each reply to your stored profile, same-turn
            signals, and prior chat turns (episodic memory). It does not fine-tune model weights — improvement comes from
            MongoDB memory, retrieval ranking, and your profile evolving over turns. Each send streams retrieval,
            generation, profile learning, and evaluation. For{" "}
            <span className="font-mono text-zinc-400">{userId}</span>, see “Your profile” in the sidebar for situational
            facts, tone trail, and notes — updated live after each reply.
          </p>
        </div>
      </header>

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="chat-scroll flex-1 overflow-y-auto px-4 pb-8 pt-6 md:px-10">
          <div className="mx-auto flex max-w-2xl flex-col gap-6">
            {messages.length === 0 && (
              <div className="rounded-2xl border border-white/[0.06] bg-zinc-900/40 p-5">
                <p className="text-sm text-zinc-300">Try asking, for example:</p>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-500">
                  <li>What documents do I need for a Skilled Worker visa?</li>
                  <li>Do I need a sponsor for the Skilled Worker route?</li>
                  <li>How does the salary threshold work?</li>
                </ul>
              </div>
            )}

            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            <div ref={bottomRef} />
          </div>
        </div>

        <div className="shrink-0 border-t border-white/[0.06] bg-[#0a0a0c]/95 px-4 py-4 backdrop-blur md:px-10">
          <div className="mx-auto flex max-w-2xl flex-col gap-2">
            <label htmlFor="chat-input" className="sr-only">
              Message
            </label>
            <textarea
              id="chat-input"
              rows={2}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Type your question…"
              disabled={busy}
              className="min-h-[56px] w-full resize-y rounded-2xl border border-white/[0.08] bg-zinc-900/80 px-4 py-3 text-[15px] leading-relaxed text-zinc-100 outline-none ring-teal-500/0 transition placeholder:text-zinc-600 focus:border-teal-500/35 focus:ring-2 focus:ring-teal-500/15 disabled:opacity-50"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] text-zinc-600">Enter to send · Shift+Enter newline</span>
              <button
                type="button"
                disabled={!canSend}
                onClick={() => void handleSend()}
                className="rounded-xl bg-teal-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-teal-900/25 transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                {busy ? "Running…" : "Send"}
              </button>
            </div>
            <p className="text-center text-[11px] text-zinc-600">
              General information only—not legal advice. Confirm on GOV.UK.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const [showMeta, setShowMeta] = useState(false);
  const isUser = message.role === "user";
  const events = message.streamEvents ?? [];

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {!isUser && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-[10px] font-bold text-teal-300 ring-1 ring-teal-500/20">
          EV
        </div>
      )}
      {isUser && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-[10px] font-bold text-zinc-300 ring-1 ring-white/10">
          You
        </div>
      )}

      <div className={`min-w-0 flex-1 ${isUser ? "text-right" : ""}`}>
        <div
          className={`inline-block max-w-full rounded-2xl px-4 py-3 text-left ${
            isUser
              ? "bg-zinc-800 text-zinc-100 ring-1 ring-white/[0.08]"
              : "bg-zinc-900/90 ring-1 ring-white/[0.06]"
          } ${isUser ? "rounded-tr-sm" : "rounded-tl-sm"}`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{message.content}</p>
          ) : (
            <>
              {message.streaming && events.length > 0 && <ChatStreamLog events={events} />}
              {message.streaming && events.length === 0 && (
                <p className="text-sm text-zinc-500">Connecting to harness…</p>
              )}
              {message.content ? (
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-100">
                  {message.content}
                </p>
              ) : (
                message.streaming && (
                  <p className="text-sm italic text-zinc-600">Awaiting model response…</p>
                )
              )}
              {message.error && (
                <p className="mt-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {message.error}
                </p>
              )}
              {!message.streaming && events.length > 0 && <ProofTranscriptInline events={events} />}
            </>
          )}
        </div>

        {!isUser && message.meta && !message.streaming && (
          <div className="mt-2 text-left">
            <button
              type="button"
              onClick={() => setShowMeta((v) => !v)}
              className="text-[11px] font-semibold text-teal-500/90 hover:text-teal-400"
            >
              {showMeta ? "Hide scores & context" : "Scores & retrieved context"}
            </button>
            {showMeta && <HarnessDetails meta={message.meta} />}
          </div>
        )}
      </div>
    </div>
  );
}

function HarnessDetails({ meta }: { meta: ChatApiResponse }) {
  const trace = meta.retrieval_trace;
  const evaluation = meta.evaluation || {};
  const memories = meta.retrieved_memories || [];
  const ctx = meta.retrieved_context || [];
  const turnSig = meta.turn_signals;
  const prof = meta.user_profile;
  const delta = meta.profile_learning_delta;

  return (
    <div className="mt-2 space-y-3 rounded-xl border border-white/[0.06] bg-black/35 p-4 text-xs text-zinc-300">
      <div className="flex flex-wrap gap-2">
        <span className="rounded-md bg-white/[0.06] px-2 py-1 font-semibold text-zinc-200">
          Score {typeof meta.score === "number" ? `${meta.score}/30` : "—"}
        </span>
        {trace?.strategy && (
          <span className="rounded-md bg-teal-500/10 px-2 py-1 text-teal-200 ring-1 ring-teal-400/20">
            {trace.strategy}
          </span>
        )}
      </div>

      {turnSig && typeof turnSig === "object" && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            This message — tone & visa-topic hints
          </p>
          <pre className="mt-1 max-h-24 overflow-auto rounded-lg bg-white/[0.03] p-2 text-[10px] text-zinc-400">
            {JSON.stringify(turnSig, null, 2)}
          </pre>
        </div>
      )}

      {prof && typeof prof === "object" && Object.keys(prof).length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Profile snapshot (after turn)</p>
          <pre className="mt-1 max-h-36 overflow-auto rounded-lg bg-violet-950/25 p-2 text-[10px] text-zinc-400">
            {JSON.stringify(prof, null, 2)}
          </pre>
        </div>
      )}

      {delta && typeof delta === "object" && Object.keys(delta).length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Profile delta merged</p>
          <pre className="mt-1 max-h-28 overflow-auto rounded-lg bg-white/[0.03] p-2 text-[10px] text-zinc-400">
            {JSON.stringify(delta, null, 2)}
          </pre>
        </div>
      )}

      {ctx.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            GOV.UK chunks ({ctx.length})
          </p>
          <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-[11px] text-zinc-500">
            {ctx.slice(0, 5).map((c, i) => (
              <li key={i} className="truncate">
                {(c as { title?: string }).title || "Chunk"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {trace?.reason && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Retrieval</p>
          <p className="mt-1 leading-relaxed text-zinc-400">{trace.reason}</p>
        </div>
      )}

      {memories.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Memories ({memories.length})
          </p>
          <ul className="mt-2 space-y-2">
            {memories.slice(0, 4).map((memory) => (
              <li key={memory.memory_id || memory.learned_strategy} className="rounded-lg bg-white/[0.03] px-2 py-1.5">
                <p className="text-zinc-200">{memory.situation}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">{memory.selection_reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {Object.keys(evaluation).length > 0 && (
        <details className="rounded-lg bg-white/[0.03] px-2 py-1.5">
          <summary className="cursor-pointer text-[11px] font-semibold text-zinc-400">
            Evaluator payload
          </summary>
          <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words text-[10px] text-zinc-500">
            {JSON.stringify(evaluation, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
