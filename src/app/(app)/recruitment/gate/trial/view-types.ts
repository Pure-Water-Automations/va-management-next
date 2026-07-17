// Local view/prop types for the reviewer trial console. These deliberately do
// NOT import from src/lib/trial/ai/** (owned by a parallel agent and possibly
// absent in this worktree) — the AI-summary shapes below are a minimal local
// contract compatible with what the generator is expected to emit. The console
// renders gracefully when no summary is present.

import type { RubricKey } from "@/lib/trial/types";
import type { CompetencyKey } from "./competency-map";

/** AI-suggested rubric scores (partial — the AI may not score every row). */
export type AiSuggestedScores = Partial<Record<RubricKey, number>>;

export interface CompetencyGroup {
  key: CompetencyKey | string;
  label: string;
  confidence?: "low" | "medium" | "high";
  evidence: string[];
}

/** Precomputed reviewer summary, compiled by the AI layer (when available). */
export interface ReviewerAiSummary {
  draftSummary?: string;
  competencyGroups?: CompetencyGroup[];
  aiSuggestedScores?: AiSuggestedScores;
  compiledAt?: string;
}

/** A single timeline entry the console renders (derived from a TrialEvent). */
export interface TimelineEntry {
  id: string;
  day: number;
  actor: string; // System | Candidate | AI | Human
  type: string;
  label: string;
  timestamp: string; // ISO
  data: unknown;
}

/** One rubric row's reviewer-facing metadata. */
export interface RubricRowView {
  key: RubricKey;
  label: string;
  weight: number;
  core: boolean;
  evidenceCount: number;
  aiSuggested?: number;
}
