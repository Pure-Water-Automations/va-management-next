# AI Bookkeeping & Client Profitability — Phase-0 Engineering Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans when a phase gets the go. This is a phase-level plan — the product plan lives in Notion ("AI-Assisted Bookkeeping & Client Profitability System", Projects DB, owner Justin, Eunmi driving; last edited Jul 16) and is NOT duplicated here.

**Goal:** Define the engineering slice that unblocks the Notion plan's Phase 1 (human bookkeeping foundation) and pre-builds the data plumbing Phases 2-3 need — without front-running the human/process work the doc deliberately puts first.

**Repo reality check (audited today):**
- `DeskLogHours` has free-text `project`/`task` and a `billable` flag — **no client attribution whatsoever**. This is the single biggest data gap: Aira's ask ("hours → client → project → payroll rate → income/expense in one view") is impossible until hours map to `ClientOrganization`.
- Zero QuickBooks code in the repo (QBO read-mirror exists only as the separate SecondBrain `quickbooks-mcp` tool — Justin-local, not app-usable).
- Already reusable: `BOOKKEEPER` role, `PayrollCalculation`, `CfoSnapshot`/`/ceo`, `ClientAssignment` (VA↔client staffing), `AuditLog`/`ActivityLog`/`SyncRun`, worker/timer pattern.
- The internal DeskLog-replacement tracker (`~/code/apps/desklog-timetracking`) is the natural future hours source — design the attribution model so the source (DeskLog API vs our tracker) is swappable.

---

### Phase 0.A — Hours→client attribution (highest-value, independent of QBO)

- New model `LaborAllocation` (or columns on `DeskLogHours`): `clientOrgId?`, `laborClass` (`CLIENT_DELIVERY | INTERNAL_OPS | SALES | TRAINING_BENCH | OWNER` — the doc's five classes), `source` (`rule | manual | ai`), `allocatedBy`.
- Inference pass (worker): match `DeskLogHours.project` free text → `ClientOrganization` via alias table seeded from `ClientAssignment` + project names; unmatched → review queue, NOT silently internal.
- Minimal review UI for the bookkeeper: unallocated-hours queue, bulk-assign, alias-rule capture ("'Leigh' → client X, remember this"). This directly kills Aira's manual monthly splitting and produces the doc's "95% of client-work time assigned" metric.

### Phase 0.B — QBO connection skeleton (read-only, sandbox first)

- QuickBooks developer app + OAuth (sandbox company per the doc's dependencies) — credentials in the house secrets pattern; **read-only scopes only** until Phase-2 acceptance.
- Ingestion worker → `QboTransaction` (immutable external id, incremental cursor, idempotent upsert — the doc's engineering controls) + `SyncRun` rows. No classification, no writeback — just a trustworthy local copy for Phase 1's cleanup reporting and Phase 2's training set.

### Phase 0.C — Finance nav stub behind the BOOKKEEPER role

- `/finance` section (Overview + Transactions + Unallocated hours) visible to `BOOKKEEPER`/admin only — thin screens over 0.A/0.B data. Gives Eunmi's Phase-1 process a working surface early; the doc's full nav list lands across Phases 2-3.

---

### Blocking decisions (before any build)

1. **Hours source of record:** DeskLog API as-is, or accelerate the desklog-timetracking replacement and build attribution there? (Proposed: build attribution in THIS app against `DeskLogHours` — it's source-agnostic since both feeds land in that table.)
2. QBO developer app + sandbox — needs Justin's Intuit login (human step).
3. Phase-1 coding standard sign-off (Eunmi + bookkeeper) precedes the alias/rules seeding — per the doc's own "clean first" risk control.

**Sequencing:** 0.A can start immediately after decision 1 (no QBO dependency); 0.B after decision 2; 0.C rides on either. **Estimate:** 0.A ~2-3 days, 0.B ~2 days, 0.C ~1 day. **Risk:** low — everything read-only or internal; no QBO writeback until the doc's Phase-2 gates pass.
