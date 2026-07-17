// POST /api/trials/review — reviewer gate decision (NextAuth session, recruiter/
// admin). The TrialEvent log IS the record: the decision is persisted as a
// GATE_DECIDED event (no schema field exists), alongside the candidate stage +
// trial status transitions from validate.ts. Auth mirrors the existing gate
// (isGateReviewer || admin) exactly. See docs/skills-trial/13 §3.

import { getCurrentUser } from "@/lib/auth/access";
import { isGateReviewer } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { resetMissionsForRevision } from "@/lib/trial/engine";
import { TRIAL_EVENTS } from "@/lib/trial/events";
import {
  RUBRIC_DIMENSIONS,
  type GateDecision,
  type GateReviewRequest,
  type GateReviewResponse,
  type RubricScores,
} from "@/lib/trial/types";
import { validateGateReview } from "./validate";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 1-based trial day from the start date (matches the timeline day fields). */
function trialDay(startDate: Date, at: Date): number {
  return Math.max(1, Math.floor((at.getTime() - startDate.getTime()) / DAY_MS) + 1);
}

/** Coerce the raw JSON body into a typed request without trusting its shape. */
function parseInput(body: Record<string, unknown>): GateReviewRequest {
  const rawScores = (body.rubricScores ?? {}) as Record<string, unknown>;
  const rubricScores = {} as RubricScores;
  for (const d of RUBRIC_DIMENSIONS) {
    const v = rawScores[d.key];
    // NaN for anything non-numeric so validation reports it as "must be set".
    rubricScores[d.key] = typeof v === "number" ? v : Number.NaN;
  }
  return {
    candidateId: typeof body.candidateId === "string" ? body.candidateId : "",
    decision: body.decision as GateDecision,
    rationale: typeof body.rationale === "string" ? body.rationale : "",
    rubricScores,
  };
}

export async function POST(request: Request): Promise<Response> {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  if (!(isGateReviewer(user.role) || user.isAdmin)) {
    return Response.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    const raw = await request.text();
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const input = parseInput(body);
  if (!input.candidateId) {
    return Response.json({ ok: false, error: "Missing candidateId." }, { status: 400 });
  }

  const trial = await db.candidateTrial.findUnique({
    where: { candidateId: input.candidateId },
    include: {
      events: {
        where: { type: TRIAL_EVENTS.HUMAN_ESCALATED },
        orderBy: { timestamp: "asc" },
      },
      conversations: {
        where: { actorType: "Human" },
        include: { messages: { orderBy: { timestamp: "asc" } } },
      },
    },
  });
  if (!trial) {
    return Response.json(
      { ok: false, error: "No skills trial found for this candidate." },
      { status: 404 },
    );
  }

  // A critical flag: any escalation with no human reply after it (doc 13 §2).
  const humanReplies = trial.conversations
    .flatMap((c) => c.messages)
    .filter((m) => m.from === "human");
  const hasUnresolvedEscalation = trial.events.some(
    (esc) => !humanReplies.some((r) => r.timestamp > esc.timestamp),
  );

  const result = validateGateReview(input, { hasUnresolvedEscalation });
  if (!result.valid || !result.transition) {
    return Response.json(
      { ok: false, error: result.errors.join(" "), unmet: result.errors },
      { status: 400 },
    );
  }

  const { newStage, trialStatus, finalDecision, tenhrGateResult } = result.transition;
  const now = new Date();
  const day = trialDay(trial.startDate, now);

  await db.$transaction(async (tx) => {
    await tx.trialEvent.create({
      data: {
        trialId: trial.id,
        day,
        actor: "Human",
        type: TRIAL_EVENTS.GATE_DECIDED,
        label: `Gate decision: ${input.decision} — ${user.name ?? user.email}`,
        dataJson: {
          decision: input.decision,
          rationale: input.rationale,
          rubricScores: input.rubricScores,
        },
      },
    });
    await tx.candidateTrial.update({
      where: { id: trial.id },
      data: { status: trialStatus },
    });
    await tx.candidate.update({
      where: { candidateId: input.candidateId },
      data: {
        currentStage: newStage,
        ...(tenhrGateResult
          ? { tenhrGateResult, gateReviewedBy: user.email }
          : {}),
        ...(finalDecision ? { finalDecision } : {}),
      },
    });
    // Atomically with the gate transition: a "revision" decision sends the
    // missions back and posts the reviewer's rationale to the candidate. Sharing
    // tx avoids a split-brain where the deal is "revision" but missions stayed approved.
    if (input.decision === "revision") {
      await resetMissionsForRevision(trial.id, input.rationale, now, tx);
    }
  });

  await logActivity({
    source: "recruitment",
    eventType: "trial_gate_decided",
    summary: `Skills-trial gate ${input.decision} for ${input.candidateId} by ${user.email} → ${newStage}`,
    severity: input.decision === "pass" ? "success" : "info",
  });

  const response: GateReviewResponse = { ok: true, newStage };
  return Response.json(response);
}
