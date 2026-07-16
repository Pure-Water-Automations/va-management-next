import { test } from "node:test";
import assert from "node:assert/strict";

import { shouldAdvanceToProposalSent } from "../src/lib/sales/agreement";
import { reconcileCallStatusForStage } from "../src/lib/sales/deal";
import { canMarkCallScheduled } from "../src/lib/actions/discovery-notes";

// ── sendClientAgreement stage advance (stage-audit Task 2) ──────────────────

test("shouldAdvanceToProposalSent: advances from pre-proposal stages", () => {
  for (const s of ["new", "discovery_scheduled", "discovery_completed", "proposal_needed", "nurture", "no_show"] as const) {
    assert.equal(shouldAdvanceToProposalSent(s), true, `${s} should advance`);
  }
});

test("shouldAdvanceToProposalSent: never drags a deal backward from proposal_sent or later", () => {
  for (const s of ["proposal_sent", "negotiation", "verbal_yes", "won", "lost"] as const) {
    assert.equal(shouldAdvanceToProposalSent(s), false, `${s} must not advance`);
  }
});

// ── setDealStage call-chip reconciliation (stage-audit Task 4) ──────────────

const now = new Date("2026-07-16T12:00:00.000Z");
const past = new Date("2026-07-10T09:00:00.000Z");
const future = new Date("2026-07-20T09:00:00.000Z");

test("reconcileCallStatusForStage: scheduled chip → completed when moving past discovery", () => {
  for (const stage of ["proposal_needed", "proposal_sent", "negotiation", "verbal_yes", "won"] as const) {
    assert.equal(
      reconcileCallStatusForStage({ stage, callStatus: "scheduled", callAt: future, now }),
      "completed",
      `${stage} should complete the chip`,
    );
  }
});

test("reconcileCallStatusForStage: scheduled + moving to new clears only a past call", () => {
  assert.equal(reconcileCallStatusForStage({ stage: "new", callStatus: "scheduled", callAt: past, now }), "cleared");
  // Future call while back at new → leave it alone (call is still upcoming).
  assert.equal(reconcileCallStatusForStage({ stage: "new", callStatus: "scheduled", callAt: future, now }), null);
});

test("reconcileCallStatusForStage: leaves non-scheduled chips untouched", () => {
  assert.equal(reconcileCallStatusForStage({ stage: "won", callStatus: "completed", callAt: future, now }), null);
  assert.equal(reconcileCallStatusForStage({ stage: "won", callStatus: null, callAt: null, now }), null);
  // A scheduled chip on a still-in-discovery stage is fine — no change.
  assert.equal(reconcileCallStatusForStage({ stage: "discovery_scheduled", callStatus: "scheduled", callAt: future, now }), null);
});

// ── setCallStatus guard (stage-audit Task 4) ────────────────────────────────

test("canMarkCallScheduled: only pre-discovery stages may resurrect a scheduled chip", () => {
  for (const s of ["new", "discovery_scheduled", "nurture", "no_show"] as const) {
    assert.equal(canMarkCallScheduled(s), true, `${s} may schedule`);
  }
  for (const s of ["discovery_completed", "proposal_needed", "proposal_sent", "negotiation", "verbal_yes", "won", "lost"] as const) {
    assert.equal(canMarkCallScheduled(s), false, `${s} may not schedule`);
  }
});
