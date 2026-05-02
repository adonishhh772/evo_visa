"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getKnowledgeChunkDetail,
  getKnowledgeChunks,
  getKnowledgeMeta,
  getKnowledgeStats,
  ingestGovUk,
  purgeAllKnowledgeChunks,
} from "@/lib/api";
import type { KnowledgeChunkDetail, KnowledgeChunkRow, KnowledgeChunksResponse } from "@/lib/types";

const URL_STORAGE_KEY = "evo_visa_kb_urls";
const FALLBACK_PURGE_PHRASE = "DELETE_ALL_VISA_KNOWLEDGE";

function normalizeUrlLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatExcerpt(text: string, maxLength: number) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
}

export default function KnowledgeBasePage() {
  const [defaultUrls, setDefaultUrls] = useState<string[]>([]);
  const [embeddingModel, setEmbeddingModel] = useState<string>("");
  const [urlEditor, setUrlEditor] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const pageSize = 25;

  const [chunks, setChunks] = useState<KnowledgeChunkRow[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [statsTotal, setStatsTotal] = useState<number | null>(null);
  const [uniqueUrls, setUniqueUrls] = useState<number | null>(null);

  const [listLoading, setListLoading] = useState(true);
  const [ingestLoading, setIngestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ingestMessage, setIngestMessage] = useState<string | null>(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<KnowledgeChunkDetail | null>(null);

  const [purgeConfirmPhrase, setPurgeConfirmPhrase] = useState(FALLBACK_PURGE_PHRASE);
  const [purgeModalOpen, setPurgeModalOpen] = useState(false);
  const [purgeInput, setPurgeInput] = useState("");
  const [purgeLoading, setPurgeLoading] = useState(false);

  const loadMetaAndUrls = useCallback(async () => {
    try {
      const metaPayload = (await getKnowledgeMeta()) as {
        default_govuk_urls?: string[];
        embedding_model?: string;
        purge_confirm_phrase?: string;
      };
      const defaults = metaPayload.default_govuk_urls || [];
      setDefaultUrls(defaults);
      setEmbeddingModel(metaPayload.embedding_model || "");
      if (metaPayload.purge_confirm_phrase?.trim()) {
        setPurgeConfirmPhrase(metaPayload.purge_confirm_phrase.trim());
      } else {
        setPurgeConfirmPhrase(FALLBACK_PURGE_PHRASE);
      }

      let stored = "";
      try {
        stored = localStorage.getItem(URL_STORAGE_KEY) || "";
      } catch {
        stored = "";
      }
      if (stored.trim()) {
        setUrlEditor(stored);
      } else {
        setUrlEditor(defaults.join("\n"));
      }
    } catch {
      setError("Unable to load knowledge metadata from API.");
    }
  }, []);

  const refreshStats = useCallback(async () => {
    try {
      const statsPayload = (await getKnowledgeStats()) as {
        total_chunks?: number;
        unique_source_urls?: number;
      };
      setStatsTotal(typeof statsPayload.total_chunks === "number" ? statsPayload.total_chunks : null);
      setUniqueUrls(
        typeof statsPayload.unique_source_urls === "number" ? statsPayload.unique_source_urls : null,
      );
    } catch {
      setStatsTotal(null);
      setUniqueUrls(null);
    }
  }, []);

  const refreshChunks = useCallback(
    async (override?: { offset?: number }) => {
      const activeOffset = typeof override?.offset === "number" ? override.offset : offset;
      setListLoading(true);
      setError(null);
      try {
        const payload = (await getKnowledgeChunks({
          offset: activeOffset,
          limit: pageSize,
          q: appliedSearch || undefined,
        })) as KnowledgeChunksResponse;
        setChunks(payload.chunks || []);
        setTotalChunks(payload.total ?? 0);
        if (payload.embedding_model) setEmbeddingModel(payload.embedding_model);
      } catch (listError) {
        const message = listError instanceof Error ? listError.message : "Failed to load chunks.";
        setError(message);
        setChunks([]);
        setTotalChunks(0);
      } finally {
        setListLoading(false);
      }
    },
    [appliedSearch, offset],
  );

  useEffect(() => {
    void loadMetaAndUrls();
  }, [loadMetaAndUrls]);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  useEffect(() => {
    void refreshChunks();
  }, [refreshChunks]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(totalChunks / pageSize)), [totalChunks]);

  const currentPage = useMemo(() => Math.floor(offset / pageSize) + 1, [offset, pageSize]);

  function persistUrlEditor() {
    try {
      localStorage.setItem(URL_STORAGE_KEY, urlEditor);
      setIngestMessage("URL list saved in this browser.");
    } catch {
      setIngestMessage("Could not save URL list locally.");
    }
  }

  function handleResetDefaults() {
    setUrlEditor(defaultUrls.join("\n"));
    try {
      localStorage.removeItem(URL_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setIngestMessage("Restored default GOV.UK URLs from backend.");
  }

  async function handleIngest() {
    const urls = normalizeUrlLines(urlEditor);
    if (!urls.length) {
      setError("Add at least one URL before running ingest.");
      return;
    }
    setIngestLoading(true);
    setError(null);
    setIngestMessage(null);
    try {
      const result = (await ingestGovUk({ urls })) as { chunks_inserted?: number };
      const inserted = result.chunks_inserted ?? 0;
      setIngestMessage(`Ingest complete · ${inserted} chunk rows upserted.`);
      persistUrlEditor();
      setOffset(0);
      await refreshStats();
      await refreshChunks({ offset: 0 });
    } catch (ingestError) {
      const message = ingestError instanceof Error ? ingestError.message : "Ingest failed.";
      setError(message);
    } finally {
      setIngestLoading(false);
    }
  }

  async function handlePurgeAll() {
    setPurgeLoading(true);
    setError(null);
    try {
      const result = (await purgeAllKnowledgeChunks(purgeInput.trim())) as {
        deleted_count?: number;
      };
      const deleted = result.deleted_count ?? 0;
      setIngestMessage(`Purged visa_knowledge · ${deleted} documents deleted.`);
      setPurgeModalOpen(false);
      setPurgeInput("");
      setDetailOpen(false);
      setDetail(null);
      setOffset(0);
      await refreshStats();
      await refreshChunks({ offset: 0 });
    } catch (purgeError) {
      const message = purgeError instanceof Error ? purgeError.message : "Purge failed.";
      setError(message);
    } finally {
      setPurgeLoading(false);
    }
  }

  async function openDetail(chunkId: string) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const payload = (await getKnowledgeChunkDetail(chunkId)) as KnowledgeChunkDetail;
      setDetail(payload);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  const disablePrev = offset <= 0;
  const disableNext = offset + pageSize >= totalChunks;

  return (
    <div className="min-h-screen bg-[#0c0c0e] px-6 py-10 text-zinc-100 md:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="space-y-3 border-b border-white/[0.06] pb-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-teal-400/90">
            GOV.UK knowledge plane
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">
            Knowledge base console
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">
            Curate GOV.UK source URLs, run ingest, and inspect every chunk with citations and
            embedding stats. Full vectors stay in MongoDB; the UI shows dimensions plus a short
            preview for demos.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard label="Indexed chunks" value={statsTotal !== null ? String(statsTotal) : "—"} hint="MongoDB visa_knowledge" />
          <StatCard label="Source URLs" value={uniqueUrls !== null ? String(uniqueUrls) : "—"} hint="Distinct GOV.UK pages" />
          <StatCard label="Embedding model" value={embeddingModel || "—"} hint="OpenAI vector field" />
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-6 shadow-xl shadow-black/40">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Source URLs</h2>
              <p className="mt-1 text-sm text-zinc-400">
                One HTTPS URL per line. Ingest downloads HTML, strips boilerplate, chunks text,
                embeds with {embeddingModel || "your configured model"}, and upserts into{" "}
                <span className="font-mono text-xs text-teal-200/90">visa_knowledge</span>.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleResetDefaults}
                className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs font-semibold text-white hover:bg-white/[0.06]"
              >
                Reset defaults
              </button>
              <button
                type="button"
                onClick={persistUrlEditor}
                className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs font-semibold text-white hover:bg-white/[0.06]"
              >
                Save list locally
              </button>
            </div>
          </div>

          <textarea
            value={urlEditor}
            onChange={(event) => setUrlEditor(event.target.value)}
            spellCheck={false}
            className="mt-4 min-h-[140px] w-full rounded-xl border border-white/[0.08] bg-black/35 px-4 py-3 font-mono text-[13px] leading-relaxed text-teal-50 outline-none ring-teal-500/0 transition focus:border-teal-500/35 focus:ring-2 focus:ring-teal-500/15"
            placeholder="https://www.gov.uk/skilled-worker-visa"
          />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={ingestLoading}
              onClick={() => void handleIngest()}
              className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/30 transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-zinc-700"
            >
              {ingestLoading ? "Ingesting…" : "Run ingest"}
            </button>
            <button
              type="button"
              onClick={() => void refreshChunks()}
              className="rounded-xl border border-white/[0.08] bg-transparent px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/[0.04]"
            >
              Refresh table
            </button>
            <button
              type="button"
              onClick={() => void refreshStats()}
              className="rounded-xl border border-white/[0.08] bg-transparent px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-white/[0.04]"
            >
              Refresh stats
            </button>
          </div>

          {ingestMessage && (
            <p className="mt-3 rounded-xl border border-teal-500/25 bg-teal-500/10 px-4 py-3 text-sm text-teal-50">
              {ingestMessage}
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-rose-500/25 bg-rose-950/20 p-6 shadow-xl shadow-black/40">
          <h2 className="text-lg font-semibold text-rose-100">Danger zone</h2>
          <p className="mt-2 max-w-3xl text-sm text-rose-100/70">
            Permanently delete every document in the{" "}
            <span className="font-mono text-xs text-rose-200">visa_knowledge</span> collection
            (chunks, embeddings, citations). Semantic memories and episodic data in other
            collections are not affected. Re-run ingest afterward to rebuild the corpus.
          </p>
          <button
            type="button"
            onClick={() => {
              setPurgeModalOpen(true);
              setPurgeInput("");
              setError(null);
            }}
            className="mt-4 rounded-xl border border-rose-500/40 bg-rose-600/20 px-4 py-2 text-sm font-semibold text-rose-50 transition hover:bg-rose-600/35"
          >
            Delete all chunks…
          </button>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-6 shadow-xl shadow-black/40">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-1 flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Search corpus
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    setAppliedSearch(searchQuery.trim());
                    setOffset(0);
                  }
                }}
                placeholder="Title, URL, chunk id, or body text"
                className="rounded-xl border border-white/[0.08] bg-black/35 px-4 py-2 text-sm font-normal text-zinc-100 outline-none focus:border-teal-500/35 focus:ring-2 focus:ring-teal-500/15"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setAppliedSearch(searchQuery.trim());
                setOffset(0);
              }}
              className="rounded-xl bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white hover:bg-white/[0.1]"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setAppliedSearch("");
                setOffset(0);
              }}
              className="rounded-xl border border-white/[0.08] px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-white/[0.04]"
            >
              Clear
            </button>
          </div>

          {error && (
            <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </p>
          )}

          <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.06]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] bg-black/30 px-4 py-3 text-xs text-zinc-500">
              <span>
                Showing{" "}
                <span className="font-semibold text-zinc-200">
                  {totalChunks === 0 ? 0 : offset + 1}–{Math.min(offset + pageSize, totalChunks)}
                </span>{" "}
                of <span className="font-semibold text-zinc-200">{totalChunks}</span> chunks
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={disablePrev || listLoading}
                  onClick={() => setOffset((value) => Math.max(0, value - pageSize))}
                  className="rounded-lg border border-white/[0.08] px-3 py-1 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-[11px] text-zinc-500">
                  Page {currentPage} / {pageCount}
                </span>
                <button
                  type="button"
                  disabled={disableNext || listLoading}
                  onClick={() => setOffset((value) => value + pageSize)}
                  className="rounded-lg border border-white/[0.08] px-3 py-1 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/[0.05] text-left text-sm">
                <thead className="bg-black/40 text-[11px] uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Citation</th>
                    <th className="px-4 py-3 font-semibold">Excerpt</th>
                    <th className="px-4 py-3 font-semibold">Embedding</th>
                    <th className="px-4 py-3 font-semibold">Checked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04] bg-zinc-950/40">
                  {listLoading && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-zinc-500">
                        Loading knowledge rows…
                      </td>
                    </tr>
                  )}
                  {!listLoading && chunks.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-sm text-zinc-500">
                        No chunks yet. Run ingest with at least one GOV.UK URL.
                      </td>
                    </tr>
                  )}
                  {!listLoading &&
                    chunks.map((row) => (
                      <tr
                        key={row.chunk_id}
                        className="cursor-pointer transition hover:bg-white/[0.03]"
                        onClick={() => void openDetail(row.chunk_id)}
                      >
                        <td className="align-top px-4 py-4">
                          <p className="font-semibold text-white">{row.title}</p>
                          <a
                            href={row.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex text-xs text-teal-300 hover:text-teal-200"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {row.source_url}
                          </a>
                          <p className="mt-2 font-mono text-[10px] text-zinc-500">{row.chunk_id}</p>
                        </td>
                        <td className="align-top px-4 py-4 text-sm text-zinc-400">
                          {formatExcerpt(row.content, 220)}
                        </td>
                        <td className="align-top px-4 py-4">
                          <span className="inline-flex rounded-full bg-teal-500/15 px-3 py-1 text-xs font-semibold text-teal-100 ring-1 ring-teal-400/25">
                            {row.embedding_dimensions} dims
                          </span>
                          {!row.has_embedding && (
                            <p className="mt-2 text-[11px] text-amber-300">Missing vector</p>
                          )}
                        </td>
                        <td className="align-top px-4 py-4 text-xs text-zinc-500">
                          {row.last_checked_at ? row.last_checked_at : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      {detailOpen && (
        <DetailDrawer
          loading={detailLoading}
          detail={detail}
          embeddingModel={embeddingModel}
          onClose={() => setDetailOpen(false)}
        />
      )}

      {purgeModalOpen && (
        <PurgeConfirmModal
          phrase={purgeConfirmPhrase}
          input={purgeInput}
          loading={purgeLoading}
          onInputChange={setPurgeInput}
          onCancel={() => {
            setPurgeModalOpen(false);
            setPurgeInput("");
          }}
          onConfirm={() => void handlePurgeAll()}
        />
      )}
    </div>
  );
}

function PurgeConfirmModal({
  phrase,
  input,
  loading,
  onInputChange,
  onCancel,
  onConfirm,
}: {
  phrase: string;
  input: string;
  loading: boolean;
  onInputChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const matches = input.trim() === phrase;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-[#18181b] p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">Delete all knowledge chunks?</h3>
        <p className="mt-2 text-sm text-zinc-400">
          This cannot be undone. Type the confirmation phrase exactly (copy from below):
        </p>
        <p className="mt-3 rounded-lg border border-white/[0.08] bg-black/40 px-3 py-2 font-mono text-xs text-teal-200">
          {phrase}
        </p>
        <input
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="Confirmation phrase"
          className="mt-4 w-full rounded-xl border border-white/[0.08] bg-black/35 px-4 py-2 text-sm text-white outline-none focus:border-rose-500/40 focus:ring-2 focus:ring-rose-500/15"
        />
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-white/[0.08] px-4 py-2 text-sm font-semibold text-zinc-300 hover:bg-white/[0.05] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!matches || loading}
            onClick={onConfirm}
            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-zinc-700"
          >
            {loading ? "Deleting…" : "Delete everything"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-zinc-900/70 to-black/40 p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
    </div>
  );
}

function DetailDrawer({
  loading,
  detail,
  embeddingModel,
  onClose,
}: {
  loading: boolean;
  detail: KnowledgeChunkDetail | null;
  embeddingModel: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/70 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-xl flex-col border-l border-white/[0.08] bg-[#0c0c0e] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Chunk detail
            </p>
            <p className="text-lg font-semibold text-white">{detail?.title || "—"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/[0.08] px-3 py-1 text-sm text-zinc-300 hover:bg-white/[0.05]"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-zinc-300">
          {loading && <p className="text-zinc-500">Loading chunk…</p>}
          {!loading && !detail && <p className="text-red-300">Unable to load this chunk.</p>}
          {!loading && detail && (
            <div className="space-y-5">
              <div className="rounded-xl border border-white/[0.06] bg-black/30 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Citation
                </p>
                <a
                  href={detail.citation?.url || detail.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex text-sm text-teal-300 hover:text-teal-200"
                >
                  {detail.citation?.url || detail.source_url}
                </a>
                <p className="mt-3 font-mono text-[11px] text-zinc-500">{detail.chunk_id}</p>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(detail.chunk_id)}
                  className="mt-3 rounded-lg border border-white/[0.08] px-3 py-1 text-[11px] font-semibold text-white hover:bg-white/[0.05]"
                >
                  Copy chunk id
                </button>
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Full text
                </p>
                <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-white/[0.06] bg-black/25 p-4 text-sm leading-relaxed text-zinc-200">
                  <pre className="whitespace-pre-wrap font-sans">{detail.content}</pre>
                </div>
              </div>

              <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-200/80">
                  Embedding signal
                </p>
                <p className="mt-2 text-sm text-zinc-300">
                  Model: <span className="font-semibold text-white">{detail.embedding_model || embeddingModel}</span>
                </p>
                <p className="mt-1 text-sm text-zinc-400">
                  Dimensions:{" "}
                  <span className="font-semibold text-white">{detail.embedding_dimensions}</span>
                </p>
                <p className="mt-3 text-[11px] text-zinc-500">{detail.embedding_preview_note}</p>
                <pre className="mt-3 overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-[11px] text-teal-100">
                  [{detail.embedding_preview?.join(", ") || ""}]
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
