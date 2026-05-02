import type { Metadata } from "next";
import { FlowCanvas } from "@/components/flow/FlowCanvas";

export const metadata: Metadata = {
  title: "Architecture · EvoVisa",
  description: "Multi-agent adaptive retrieval harness with MongoDB memory.",
};

export default function ArchitecturePage() {
  return (
    <div className="min-h-screen bg-[#0c0c0e] px-6 py-10 text-zinc-100 md:px-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-teal-400/90">
            Technical deep dive
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Architecture & agent collaboration
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">
            EvoVisa chains retrieval, answering, evaluation, and reflection. Learned strategies are
            embedded and stored in MongoDB, then boosted during adaptive retrieval—model weights stay
            frozen.
          </p>
        </header>

        <FlowCanvas />

        <section className="grid gap-4 md:grid-cols-3">
          {[
            {
              title: "Adaptive retrieval",
              body: "Hybrid similarity plus usage and improvement signals. Prior evaluator scores rebalance GOV.UK vs semantic memory emphasis.",
            },
            {
              title: "Multi-agent roles",
              body: "Retrieval, visa consultant, evaluator, and reflection agents collaborate with explicit contracts—no monolithic prompt soup.",
            },
            {
              title: "MongoDB as memory",
              body: "visa_knowledge grounds facts; semantic_memories capture reusable strategies; episodic_memories recall past turns per user.",
            },
          ].map((card) => (
            <article
              key={card.title}
              className="rounded-2xl border border-white/[0.06] bg-zinc-900/40 p-5 shadow-inner shadow-black/40"
            >
              <h3 className="text-sm font-semibold text-white">{card.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">{card.body}</p>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}
