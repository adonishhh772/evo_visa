export type RetrievedMemory = {
  memory_id?: string;
  situation?: string;
  learned_strategy?: string;
  tags?: string[];
  relevance_score?: number;
  selection_reason?: string;
};

export type RetrievalTrace = {
  strategy?: string;
  govuk_chunks_found?: number;
  semantic_memories_found?: number;
  episodic_memories_found?: number;
  weights?: Record<string, number>;
  reason?: string;
  programmatic_reason?: string;
  llm_reason?: string;
  govuk_top_k?: number;
  prior_answer_accuracy?: number;
  govuk_top_k_rationale?: string;
  /** Visa-topic keyword hints for grounding (same turn). */
  turn_intent_hints?: string[];
  /** Tone / communication markers from the user message (same turn). */
  turn_tone_markers?: string[];
  /** Same-turn cues such as likely_outside_uk / likely_inside_uk. */
  turn_situation_hints?: string[];
};

export type WorkflowPhase = "baseline" | "learning" | "adaptive" | "outcome";

export type WorkflowStep = {
  id: string;
  phase: WorkflowPhase;
  title: string;
  agent: string;
  summary: string;
  details?: Record<string, unknown>;
};

export type UserProfileSnapshot = {
  user_id?: string;
  goal?: string | null;
  preferred_style?: string;
  /** Persisted: unknown | outside_uk | inside_uk — drives overseas vs in-UK framing. */
  uk_presence?: string;
  nationality?: string | null;
  current_location?: string | null;
  mentioned_facts?: string[];
  /** Legacy visa-topic trace; newer flows use tone_history. */
  intent_history?: string[];
  tone_history?: string[];
  psychological_notes?: string[];
  topic_tags?: string[];
  persona_bullets?: string[];
  interaction_count?: number;
  updated_at?: string;
  known_confusions?: string[];
};

export type ChatApiResponse = {
  answer?: string;
  score?: number;
  retrieved_context?: unknown[];
  retrieved_memories?: RetrievedMemory[];
  learned_memory?: Record<string, unknown>;
  evaluation?: Record<string, unknown>;
  retrieval_trace?: RetrievalTrace;
  /** Persisted profile after this turn (Mongo user_profiles). */
  user_profile?: UserProfileSnapshot;
  /** Same-turn fast scan: tone, situation (UK vs abroad), visa-topic hints. */
  turn_signals?: {
    tone_markers?: string[];
    situation_hints?: string[];
    visa_topic_hints?: string[];
    visa_topic_labels?: string[];
  };
  /** Fields merged by the profile-learning LLM this turn. */
  profile_learning_delta?: Record<string, unknown>;
};

export type KnowledgeChunkRow = {
  chunk_id: string;
  title: string;
  visa_route: string;
  content: string;
  source_url: string;
  last_checked_at?: string | null;
  embedding_dimensions: number;
  has_embedding: boolean;
};

export type KnowledgeChunkDetail = KnowledgeChunkRow & {
  embedding_preview: number[];
  embedding_preview_note?: string;
  embedding_model?: string;
  citation?: { label: string; url: string; route: string };
};

export type KnowledgeChunksResponse = {
  chunks: KnowledgeChunkRow[];
  total: number;
  offset: number;
  limit: number;
  embedding_model?: string;
};

export type DemoConversationTurn = {
  turn_index?: number;
  query?: string;
  followup_baseline_answer?: string;
  score_followup_baseline?: number;
  evaluation_followup_baseline?: Record<string, unknown>;
  answer_with_memory?: string;
  score_with_memory?: number;
  evaluation_with_memory?: Record<string, unknown>;
  improvement?: number;
  improvement_headroom_pct?: number;
  retrieval_trace?: RetrievalTrace;
  retrieved_memories?: RetrievedMemory[];
};

export type DemoResult = {
  initial_query?: string;
  answer_without_memory?: string;
  score_without_memory?: number;
  evaluation_without_memory?: Record<string, unknown>;
  learned_memory?: Record<string, unknown>;
  follow_up_query?: string;
  followup_baseline_answer?: string;
  score_followup_baseline?: number;
  evaluation_followup_baseline?: Record<string, unknown>;
  retrieved_memories?: RetrievedMemory[];
  retrieval_trace?: RetrievalTrace;
  workflow_steps?: WorkflowStep[];
  answer_with_memory?: string;
  score_with_memory?: number;
  evaluation_with_memory?: Record<string, unknown>;
  improvement?: number;
  improvement_headroom_pct?: number;
  conversation_turns?: DemoConversationTurn[];
  preset_turns_used?: boolean;
  follow_chain?: string[];
  /** Full semantic + episodic lists for demo transparency */
  memory_inventory?: Record<string, unknown>;
};

/** SSE events from POST /api/demo/run/stream */
export type DemoStreamEvent = {
  seq?: number;
  type: string;
  step_id?: string;
  phase?: string;
  agent?: string;
  title?: string;
  turn_index?: number;
  proof?: Record<string, unknown>;
  kind?: string;
  turn_label?: string;
  text?: string;
  variant?: string;
  meta?: Record<string, unknown>;
  detail?: string;
  query?: string;
  initial_query?: string;
  follow_chain?: string[];
  preset_turns_used?: boolean;
  user_id?: string;
  result?: DemoResult;
  /** SSE: profile merged after chat_profile_learn step. */
  profile?: Record<string, unknown>;
  delta_applied?: Record<string, unknown>;
};
