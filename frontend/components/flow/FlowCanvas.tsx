"use client";

import { useEffect, useId, useState } from "react";

const DIAGRAM = `
flowchart TB
    subgraph plane["Data plane · MongoDB Atlas"]
        direction LR
        VK[("visa_knowledge<br/>GOV.UK + vectors")]
        SM[("semantic_memories<br/>learned strategies")]
        EM[("episodic_memories<br/>user turns")]
        UP[("user_profiles<br/>UK vs abroad · facts · tone · topics")]
        ER[("evaluation_runs")]
    end

    subgraph harness["Agentic harness · chat & demo"]
        direction TB
        U[/User query/] --> UP_READ[Load profile]
        U --> HI{{Tone & communication scan<br/>+ visa-topic hints}}
        UP --> UP_READ
        UP_READ --> RA{{Retrieval agent<br/>GOV.UK + memories + hints}}
        HI --> RA
        RA --> VC[Visa consultant agent<br/>profile + turn signals]
        UP_READ --> VC
        HI --> VC
        VC --> PL[Profile learning<br/>LLM infers delta · merge]
        PL -->|upsert| UP
        VC --> EV[Evaluator agent]
        EV --> ER
        EV --> RF{Gaps or low score?}
        RF -->|yes| RL[Reflection agent]
        RL --> SM
    end

    VK --> RA
    SM --> RA
    EM --> RA

    style plane fill:#09090b,stroke:#27272a,color:#e4e4e7
    style harness fill:#0c0c0e,stroke:#27272a,color:#e4e4e7
`;

export function FlowCanvas() {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        const mod = await import("mermaid");
        const mermaid = mod.default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "loose",
          suppressErrorRendering: true,
        });
        const elementId = `evo-flow-${reactId}`;
        const { svg: rendered } = await mermaid.render(elementId, DIAGRAM);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (diagramError) {
        if (!cancelled) {
          const message =
            diagramError instanceof Error ? diagramError.message : "Diagram failed to render.";
          setError(message);
        }
      }
    }

    void renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [reactId]);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-zinc-950 via-zinc-950 to-teal-950/30 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(45,212,191,0.12),_transparent_55%)]" />
      <div className="relative">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-400/90">
              Live diagram
            </p>
            <h2 className="mt-1 text-lg font-semibold text-white">How EvoVisa learns without fine-tuning</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
              Retrieval sees tone/psychological context and optional visa-topic hints; the consultant adapts warmth and
              clarity; profile learning merges durable relational traits into{" "}
              <span className="text-zinc-400">user_profiles</span> before evaluation and optional reflection.
            </p>
          </div>
          <span className="rounded-full border border-white/[0.08] bg-black/30 px-3 py-1 text-[11px] text-zinc-400">
            MongoDB = context + memory + profile
          </span>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            Could not render Mermaid diagram: {error}
          </div>
        )}

        {!error && !svg && (
          <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
            Rendering architecture diagram…
          </div>
        )}

        {svg && (
          <div
            className="flow-svg mx-auto max-w-full overflow-x-auto [&_svg]:mx-auto [&_svg]:max-w-none"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
      </div>
    </div>
  );
}
