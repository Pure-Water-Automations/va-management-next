# Lead Stage Transitions: Documentation + Consistency Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** "Stage logic is unclear even to Justin" (Jul 16 sync) → ship (1) the definitive transition doc, (2) fixes for the real inconsistencies the audit found. The audit is DONE — full transition table produced from code; this plan commits it and fixes what it exposed.

**How it actually works today (the one-paragraph answer):** a deal's Kanban column IS `Deal.stage`, nothing derived. Automatic moves exist only at the edges: `/discover` submit → `new` (re-submit from nurture/no_show → back to `new`); lead books a call → `discovery_scheduled`; rep saves call notes → `discovery_completed`; lead cancels → back to `new`; signed+paid → `won` (auto-convert). Everything in the middle — `proposal_needed`, `proposal_sent`, `negotiation`, `verbal_yes`, `nurture`, `lost` — moves ONLY by manual drag/dropdown/button. A separate free-text `discoveryCallStatus` field tracks the call chip independently, and it can drift from the stage.

---

### Task 1: Commit the documentation

**Files:** Create `docs/sales-pipeline-stages.md`

- [ ] Write up the audit output: the full transition table (from-stage → to-stage → trigger → automatic/manual → file:line), the paragraph above as the intro, and a "by design vs bug" section (middle stages manual-on-purpose = rep judgment; the four bugs below = fixed by this plan). Team-facing tone — this doubles as the answer to Aira's confusion. Link it from AGENTS.md's docs index if one exists.

### Task 2: `proposal_sent` becomes automatic (the gap Justin actually felt)

**Files:** Modify `src/lib/sales/agreement.ts` (`sendClientAgreement`, ~line 38-87) · Test `tests/` (extend agreement tests)

- [ ] Sending the agreement currently does NOT move the stage — a deal sits in `discovery_completed` while its agreement is out, which is exactly the "how does it advance?" confusion. Fix: inside `sendClientAgreement`, after the upsert, `setDealStage(dealId, "proposal_sent")` when the current stage is earlier in the funnel than `proposal_sent` (never move a deal backward from negotiation/verbal_yes on a resend).

### Task 3: Won-via-conversion syncs to Notion like won-via-dropdown

**Files:** Modify `src/lib/sales/deal.ts` (`convertDealToClient` — both the upgrade branch `deal.ts:117` and normal branch `deal.ts:149`)

- [ ] The common win path (`convertDealToClient`'s direct `db.deal.update({stage:"won"})`) skips `syncDealToNotion`; only the manual dropdown path syncs. Add the (best-effort, caught) sync call after both updates.

### Task 4: Reconcile `discoveryCallStatus` with stage moves

**Files:** Modify `src/lib/sales/deal.ts` (`setDealStage`) · `src/lib/actions/discovery-notes.ts` (`setCallStatus`)

- [ ] `setDealStage`: when a deal moves to a stage past discovery (`proposal_*`, `negotiation`, `verbal_yes`, `won`) while `discoveryCallStatus === "scheduled"`, set it to `"completed"`; when moving back to `new`, clear stale `"scheduled"` if the call time is in the past. Kills the "won deal with a 📅 scheduled chip" artifact.
- [ ] `setCallStatus`: guard `status:"scheduled"` — only allowed when the deal is at `new`/`discovery_scheduled`/`nurture`/`no_show` (the API currently lets it resurrect a call chip on a `proposal_sent` deal; no UI does this today, but the backend shouldn't allow it).

### Task 5: Dead-field note

- [ ] `Deal.reviewNeeded`/`reviewApproved` (the schema's "Team Lead special-deal gate") are referenced by NOTHING in src/. Do not build the gate now — add a `// dead: sales-SOP review gate never implemented; wire or drop when the SOP question is settled` note in the schema and a line in the doc. (Flagging, not scope-creeping.)

### Task 6: Verify

- [ ] `npm test` + build; E2E: send an agreement on a `discovery_completed` deal → card moves to Proposal sent; convert a signed+paid deal → Notion page reflects `won`; drag a scheduled-call deal to `verbal_yes` → call chip shows completed, not scheduled.

**Estimate:** doc ~1 hr; fixes ~2-3 hrs. **Risk:** low — Task 2 is the only behavior change reps will notice, and it removes a manual step they currently forget.
