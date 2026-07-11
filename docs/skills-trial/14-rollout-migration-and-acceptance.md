# PWA Skills Trial — Phase 14: Rollout, Migration & Acceptance Plan

This document defines the rollout sequence, data migration scripts, and final acceptance criteria required for cutover.

---

## 1. Phased Rollout Sequence

### Stage 0: PRD & Policy Lock (Current)
* Review and approve the 14 PRD phases and appendices.
* Lock the decision log and curriculum outline.

### Stage 1: Feature-Flagged Prototype (Staging)
* Build the schema extensions and backend actions behind a `SKILLS_TRIAL_V2` feature flag.
* Enable mock candidate simulation inside the development subdomain (IONOS dev boxes) using synthetic data.
* Block external email sends; log them to the console output instead.

### Stage 2: Shadow Pilot
* Run 2–3 real candidates through the legacy tracker while parallel-compiling their behavioral timelines using manual inputs.
* Compare AI scoring proposals with recruiters' manual evaluations to calibrate prompt parameters.

### Stage 3: Controlled Live Pilot
* Run 3 candidates through the new V2 simulated work week.
* Maintain direct human supervision over all AI coordinator prompts.

### Stage 4: Production Cutover
* Retire Version 1 (legacy checklist) templates.
* All new candidates default to Version 2.

---

## 2. Backward-Compatible Data Migration
To protect active candidates currently in `tenhr_in_progress` during cutover:

1. **Schema Migration:** Apply structural schema changes headlessly using Prisma diffing (as defined in `AGENTS.md` rules):
   ```bash
   npx prisma migrate diff \
     --from-schema-datasource prisma/schema.prisma \
     --to-schema-datamodel   prisma/schema.prisma \
     --script > prisma/migrations/$(date +%Y%m%d%H%M%S)_skills_trial_v2/migration.sql
   npx prisma migrate deploy && npx prisma generate
   ```
2. **Version Assignment:** Create a data migration script that updates existing candidates:
   * Candidates with `currentStage` in `tenhr_pass`, `tenhr_fail`, or active candidates in `tenhr_in_progress` who started before cutover are mapped to `TrialProgramVersion` `1` (Legacy checklist).
   * New candidates are assigned to Version `2` (Simulated Work Week).
3. **UI Branching:** The candidate track page (`src/app/track/[token]/TrackClient.tsx`) inspects the candidate's assigned version:
   * If `versionId` is `1` (or null), render the legacy checklist UI.
   * If `versionId` is `2`, render the new **Mission Control** UI.
* **Benefit:** Zero downtime, zero active candidate disruption, and full preservation of audit logs.

---

## 3. Acceptance Criteria Checklist
* [ ] Candidate is assigned an immutable program version and snapshot on gate approval.
* [ ] The step timer is server-calculated, preventing client-side countdown spoofing.
* [ ] The "Pass" review action is blocked if rubric dimensions are unscored or critical flags are unresolved.
* [ ] System alarms escalate to a human if AI detects inappropriate input.
* [ ] Timezone work windows are respected in reminder calculations.
