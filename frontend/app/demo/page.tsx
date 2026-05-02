"use client";

import { useMemo, useState } from "react";
import { AgentWorkflowPanel } from "@/components/AgentWorkflowPanel";
import { BeforeAfterPanel } from "@/components/BeforeAfterPanel";
import { ConversationTurnsPanel } from "@/components/ConversationTurnsPanel";
import { DemoInputPanel } from "@/components/DemoInputPanel";
import { EvaluationBreakdown } from "@/components/EvaluationBreakdown";
import { LearnedMemoryPanel } from "@/components/LearnedMemoryPanel";
import {
  DemoMemoryInventoryPanel,
  type DemoMemoryInventory,
} from "@/components/DemoMemoryInventoryPanel";
import { MemoryReusedPanel } from "@/components/MemoryReusedPanel";
import { RetrievalTracePanel } from "@/components/RetrievalTracePanel";
import { DemoLiveExecution } from "@/components/DemoLiveExecution";
import { DemoProofTranscript } from "@/components/DemoProofTranscript";
import { useUserId } from "@/components/layout/UserContext";
import { runDemoStream } from "@/lib/api";
import type {
  DemoConversationTurn,
  DemoResult,
  DemoStreamEvent,
  RetrievedMemory,
  RetrievalTrace,
  WorkflowStep,
} from "@/lib/types";

export default function DemoPage() {
  const { userId, setUserId } = useUserId();
  const [initialQuery, setInitialQuery] = useState("I want to work in the UK. What should I do?");
  const [followUpQuery, setFollowUpQuery] = useState(
    "Do I need sponsorship for a UK work visa?",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState<DemoResult | null>(null);
  const [streamEvents, setStreamEvents] = useState<DemoStreamEvent[]>([]);
  const [streaming, setStreaming] = useState(false);

  const learnedMemory = useMemo(() => {
    if (!demo?.learned_memory) return null;
    return demo.learned_memory as {
      situation?: string;
      learned_strategy?: string;
      tags?: string[];
      source_query?: string;
    };
  }, [demo]);

  const retrievedMemories = useMemo(() => {
    return (demo?.retrieved_memories || []) as RetrievedMemory[];
  }, [demo]);

  const retrievalTrace = useMemo(() => {
    const trace = demo?.retrieval_trace;
    if (!trace || typeof trace !== "object") {
      return null;
    }
    return trace as RetrievalTrace;
  }, [demo]);

  const workflowSteps = useMemo(() => {
    const raw = demo?.workflow_steps;
    if (!Array.isArray(raw)) return [];
    const phases: WorkflowStep["phase"][] = ["baseline", "learning", "adaptive", "outcome"];
    return raw.filter(
      (row): row is WorkflowStep =>
        Boolean(row) &&
        typeof row === "object" &&
        typeof (row as WorkflowStep).id === "string" &&
        typeof (row as WorkflowStep).title === "string" &&
        typeof (row as WorkflowStep).phase === "string" &&
        phases.includes((row as WorkflowStep).phase),
    );
  }, [demo]);

  const conversationTurns = useMemo(() => {
    const raw = demo?.conversation_turns;
    if (!Array.isArray(raw)) return [];
    return raw.filter(Boolean) as DemoConversationTurn[];
  }, [demo]);

  async function handleRunDemo() {
    setLoading(true);
    setStreaming(true);
    setError(null);
    setStreamEvents([]);
    setDemo(null);
    try {
      const payload = await runDemoStream(
        {
          user_id: userId,
          initial_query: initialQuery,
          follow_up_query: followUpQuery,
          extra_follow_ups: [],
        },
        (ev) => setStreamEvents((prev) => [...prev, ev]),
      );
      setDemo(payload);
      try {
        localStorage.setItem("evo_visa_last_demo", JSON.stringify(payload));
      } catch {
        /* ignore */
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Demo failed.";
      setError(message);
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0c0c0e] px-6 py-10 text-zinc-100 md:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="space-y-3 border-b border-white/[0.06] pb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-teal-400/90">
            Hackathon narrative
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Before / after adaptive memory demo
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">
            Opening turn trains reflection memory. The fair score comparison uses your first
            follow-up (same GOV.UK slice, memory on vs off). The server then runs four preset
            multi-part follow-ups (documents vs dates vs IHS order; salary & going rates & part-time;
            English evidence combinations; dependants and staggered entry) — watch the live log and
            proof transcript as each agent step
            completes. When GOV.UK grounding is already excellent, both branches can sit near the top
            of the rubric; memory should add continuity without extra fluff — check the evaluator
            breakdown if memory trails slightly.
          </p>
        </header>

        <DemoInputPanel
          initialQuery={initialQuery}
          followUpQuery={followUpQuery}
          userId={userId}
          loading={loading}
          onInitialChange={setInitialQuery}
          onFollowUpChange={setFollowUpQuery}
          onUserIdChange={setUserId}
          onRun={handleRunDemo}
        />

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-2">
          <DemoLiveExecution events={streamEvents} streaming={streaming} />
          <DemoProofTranscript events={streamEvents} streaming={streaming} />
        </div>

        {demo?.preset_turns_used && (
          <p className="text-center text-xs text-zinc-500">
            Preset multi-turn sequence applied ({Math.max(0, (demo.follow_chain ?? []).length - 1)}{" "}
            extra turns after your first follow-up).
          </p>
        )}

        <AgentWorkflowPanel steps={workflowSteps} />

        {demo?.initial_query && (
          <section className="rounded-2xl border border-white/[0.06] bg-black/20 p-5">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Opening turn (sets up learning — not the fair comparison)
            </div>
            <p className="text-sm font-medium text-zinc-200">{demo.initial_query}</p>
            <p className="mt-3 line-clamp-6 whitespace-pre-wrap text-sm leading-relaxed text-zinc-400">
              {demo.answer_without_memory}
            </p>
            <div className="mt-3 text-xs font-semibold text-zinc-500">
              Evaluator total: {demo.score_without_memory ?? 0}/30
            </div>
          </section>
        )}

        <BeforeAfterPanel
          answerFairBaseline={demo?.followup_baseline_answer || ""}
          scoreFairBaseline={demo?.score_followup_baseline ?? 0}
          answerWithMemory={demo?.answer_with_memory || ""}
          scoreWithMemory={demo?.score_with_memory || 0}
          improvement={demo?.improvement ?? 0}
          improvementHeadroomPct={demo?.improvement_headroom_pct ?? 0}
        />

        <EvaluationBreakdown
          before={demo?.evaluation_followup_baseline}
          after={demo?.evaluation_with_memory}
          beforeLabel="Fair baseline (follow-up, memory off)"
          afterLabel="Memory-augmented (same follow-up)"
        />

        <ConversationTurnsPanel turns={conversationTurns} />

        <div className="grid gap-6 lg:grid-cols-2">
          <LearnedMemoryPanel memory={learnedMemory} />
          <RetrievalTracePanel trace={retrievalTrace} />
        </div>

        <MemoryReusedPanel memories={retrievedMemories} />

        <DemoMemoryInventoryPanel
          inventory={
            demo?.memory_inventory && typeof demo.memory_inventory === "object"
              ? (demo.memory_inventory as DemoMemoryInventory)
              : null
          }
        />
      </div>
    </div>
  );
}
