import type { ChatApiResponse, DemoResult, DemoStreamEvent } from "@/lib/types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";

export type DemoPayload = {
  user_id: string;
  initial_query: string;
  follow_up_query: string;
  /** Optional; when empty the server appends preset multi-turn messages. */
  extra_follow_ups?: string[];
};

export type ChatPayload = {
  user_id: string;
  query: string;
};

async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function parseSseBuffer(buffer: string): { events: DemoStreamEvent[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: DemoStreamEvent[] = [];
  for (const block of parts) {
    const lines = block.trim().split("\n");
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        events.push(JSON.parse(line.slice(6)) as DemoStreamEvent);
      } catch {
        /* skip malformed chunk */
      }
    }
  }
  return { events, rest };
}

export async function runDemo(payload: DemoPayload): Promise<unknown> {
  const response = await fetch(`${API_BASE}/api/demo/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      extra_follow_ups: payload.extra_follow_ups?.filter((q) => q.trim()) ?? [],
    }),
  });
  const body = await parseJsonSafe(response);
  if (!response.ok) {
    const detail =
      typeof body === "object" && body && "detail" in body
        ? String((body as { detail?: unknown }).detail)
        : response.statusText;
    throw new Error(detail || `Demo request failed (${response.status})`);
  }
  return body;
}

/** Live SSE demo: invokes `onEvent` for each server event; returns final result on `done`. */
export async function runDemoStream(
  payload: DemoPayload,
  onEvent: (event: DemoStreamEvent) => void,
): Promise<DemoResult> {
  const response = await fetch(`${API_BASE}/api/demo/run/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      ...payload,
      extra_follow_ups: payload.extra_follow_ups?.filter((q) => q.trim()) ?? [],
    }),
  });

  if (!response.ok) {
    const body = await parseJsonSafe(response);
    const detail =
      typeof body === "object" && body && "detail" in body
        ? String((body as { detail?: unknown }).detail)
        : response.statusText;
    throw new Error(detail || `Demo stream failed (${response.status})`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body for demo stream.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: DemoResult | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = parseSseBuffer(buffer);
    buffer = parsed.rest;
    for (const ev of parsed.events) {
      onEvent(ev);
      if (ev.type === "error") {
        throw new Error(String(ev.detail ?? "Demo stream error"));
      }
      if (ev.type === "done" && ev.result && typeof ev.result === "object") {
        finalResult = ev.result as DemoResult;
      }
    }
  }

  const tail = parseSseBuffer(buffer + "\n\n");
  for (const ev of tail.events) {
    onEvent(ev);
    if (ev.type === "error") {
      throw new Error(String(ev.detail ?? "Demo stream error"));
    }
    if (ev.type === "done" && ev.result && typeof ev.result === "object") {
      finalResult = ev.result as DemoResult;
    }
  }

  if (!finalResult) {
    throw new Error("Demo stream ended without a complete result.");
  }
  return finalResult;
}

export async function sendChat(payload: ChatPayload): Promise<unknown> {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await parseJsonSafe(response);
  if (!response.ok) {
    const detail =
      typeof body === "object" && body && "detail" in body
        ? String((body as { detail?: unknown }).detail)
        : response.statusText;
    throw new Error(detail || `Chat request failed (${response.status})`);
  }
  return body;
}

/** Live SSE chat — same events shape as demo stream (`step_*`, `transcript`, `done`). */
export async function runChatStream(
  payload: ChatPayload,
  onEvent: (event: DemoStreamEvent) => void,
): Promise<ChatApiResponse> {
  const response = await fetch(`${API_BASE}/api/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const parsed = await parseJsonSafe(response);
    const detail =
      typeof parsed === "object" && parsed && "detail" in parsed
        ? String((parsed as { detail?: unknown }).detail)
        : response.statusText;
    throw new Error(detail || `Chat stream failed (${response.status})`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body for chat stream.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: ChatApiResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsedBuf = parseSseBuffer(buffer);
    buffer = parsedBuf.rest;
    for (const ev of parsedBuf.events) {
      onEvent(ev);
      if (ev.type === "error") {
        throw new Error(String(ev.detail ?? "Chat stream error"));
      }
      if (ev.type === "done" && ev.result && typeof ev.result === "object") {
        finalResult = ev.result as ChatApiResponse;
      }
    }
  }

  const tail = parseSseBuffer(buffer + "\n\n");
  for (const ev of tail.events) {
    onEvent(ev);
    if (ev.type === "error") {
      throw new Error(String(ev.detail ?? "Chat stream error"));
    }
    if (ev.type === "done" && ev.result && typeof ev.result === "object") {
      finalResult = ev.result as ChatApiResponse;
    }
  }

  if (!finalResult) {
    throw new Error("Chat stream ended without a result.");
  }
  return finalResult;
}

export async function fetchUserProfile(userId: string): Promise<{ profile: Record<string, unknown> } | null> {
  try {
    const search = new URLSearchParams({ user_id: userId });
    const response = await fetch(`${API_BASE}/api/profile?${search.toString()}`, { cache: "no-store" });
    const body = await parseJsonSafe(response);
    if (!response.ok || typeof body !== "object" || !body || !("profile" in body)) {
      return null;
    }
    return body as { profile: Record<string, unknown> };
  } catch {
    return null;
  }
}

export async function getMemories(): Promise<unknown> {
  try {
    const response = await fetch(`${API_BASE}/api/memories`, { cache: "no-store" });
    const body = await parseJsonSafe(response);
    if (!response.ok) {
      return { memories: [], error: `Memories unavailable (${response.status})` };
    }
    return body;
  } catch {
    return { memories: [], error: "Backend unreachable for memories." };
  }
}

export async function getEvaluationRuns(): Promise<unknown> {
  try {
    const response = await fetch(`${API_BASE}/api/evaluation-runs`, { cache: "no-store" });
    const body = await parseJsonSafe(response);
    if (!response.ok) {
      return { evaluation_runs: [], error: `Runs unavailable (${response.status})` };
    }
    return body;
  } catch {
    return { evaluation_runs: [], error: "Backend unreachable for evaluation runs." };
  }
}

export type GovUkIngestPayload = {
  urls?: string[];
  expand_related_links?: boolean;
  max_pages?: number;
};

export async function ingestGovUk(payload: GovUkIngestPayload = {}): Promise<unknown> {
  const requestBody = {
    expand_related_links: payload.expand_related_links ?? true,
    max_pages: payload.max_pages ?? 45,
    ...(payload.urls?.length ? { urls: payload.urls } : {}),
  };
  const response = await fetch(`${API_BASE}/api/ingest/govuk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  const parsed = await parseJsonSafe(response);
  if (!response.ok) {
    const detail =
      typeof parsed === "object" && parsed && "detail" in parsed
        ? String((parsed as { detail?: unknown }).detail)
        : response.statusText;
    throw new Error(detail || `Ingest failed (${response.status})`);
  }
  return parsed;
}

export async function getKnowledgeMeta(): Promise<unknown> {
  const response = await fetch(`${API_BASE}/api/knowledge/meta`, { cache: "no-store" });
  return parseJsonSafe(response);
}

export async function getKnowledgeStats(): Promise<unknown> {
  const response = await fetch(`${API_BASE}/api/knowledge/stats`, { cache: "no-store" });
  return parseJsonSafe(response);
}

export async function getKnowledgeChunks(params: {
  offset?: number;
  limit?: number;
  q?: string;
}): Promise<unknown> {
  const search = new URLSearchParams();
  search.set("offset", String(params.offset ?? 0));
  search.set("limit", String(params.limit ?? 40));
  if (params.q?.trim()) search.set("q", params.q.trim());
  const response = await fetch(`${API_BASE}/api/knowledge/chunks?${search.toString()}`, {
    cache: "no-store",
  });
  const body = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(`Knowledge list failed (${response.status})`);
  }
  return body;
}

export async function getKnowledgeChunkDetail(chunkId: string): Promise<unknown> {
  const response = await fetch(
    `${API_BASE}/api/knowledge/chunks/${encodeURIComponent(chunkId)}`,
    { cache: "no-store" },
  );
  const body = await parseJsonSafe(response);
  if (!response.ok) {
    const detail =
      typeof body === "object" && body && "detail" in body
        ? String((body as { detail?: unknown }).detail)
        : response.statusText;
    throw new Error(detail || `Chunk fetch failed (${response.status})`);
  }
  return body;
}

export async function purgeAllKnowledgeChunks(confirm: string): Promise<unknown> {
  const response = await fetch(`${API_BASE}/api/knowledge/purge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm }),
  });
  const body = await parseJsonSafe(response);
  if (!response.ok) {
    const detail =
      typeof body === "object" && body && "detail" in body
        ? String((body as { detail?: unknown }).detail)
        : response.statusText;
    throw new Error(detail || `Purge failed (${response.status})`);
  }
  return body;
}
