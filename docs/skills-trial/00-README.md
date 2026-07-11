# PWA Skills Trial — Canonical PRD Main Index

**System:** PWA VA Management Console (`Pure-Water-Automations/va-management-next`)  
**Context:** cloud replacement for the legacy Google Apps Script (GAS) VA Management System.  
**Objective:** Replace the legacy checklist-based "10-Hour Training" with a structured 5-to-7 day simulated work week (capped at 10 active hours) where Postgres is the source of truth, AI coordinates, and humans make hiring decisions.

---

## 1. Scope Boundary

### This project is:
* A redesign of the existing VA Manager recruitment gate.
* A 5-to-7 day work simulation (capped at 10 active hours of candidate effort).
* An in-app **Mission Control** candidate portal and reviewer/admin management panel in the existing VA Manager web app.
* An AI-assisted coordination, feedback, and evidence-collection pipeline.
* A final human-reviewed gate before contract signing and paid onboarding.

### This project is NOT:
* A standalone "Pure Water Workplace" product or separate repository.
* An automated hiring or rejection system (humans make every final decision).
* A curriculum that trains candidates to operate outside of PWA's canonical VA Manager console (no training candidates to use standalone Desklog or Notion as their active task management tools).

---

## 2. Current State and Gap Inventory

Following a thorough inspection of the active repository, here is the state of the current training gate:

### What exists today (Reusable assets)
* **Checklist Database Foundation:** `prisma/schema.prisma` defines [TrainingAssignment](file:///Users/justinokamoto/code/apps/va-management-next/prisma/schema.prisma#L537) (checklist catalog) and [TrainingTaskProgress](file:///Users/justinokamoto/code/apps/va-management-next/prisma/schema.prisma#L552) (candidate checklist progress).
* **Track / Access Engine:** [src/lib/actions/training.ts](file:///Users/justinokamoto/code/apps/va-management-next/src/lib/actions/training.ts) handles magic link tracking, start/end sessions, and updating training minutes.
* **Recruitment pipeline transitions:** [src/lib/actions/recruitment.ts](file:///Users/justinokamoto/code/apps/va-management-next/src/lib/actions/recruitment.ts) includes `tenhr_invited` and `tenhr_in_progress` candidate stage transitions, pre-trial onboarding-readiness gate (`preTrialGate`), and contract-generation endpoints.
* **Gate review page:** [src/app/(app)/recruitment/gate/page.tsx](file:///Users/justinokamoto/code/apps/va-management-next/src/app/(app)/recruitment/gate/page.tsx) handles basic human gate review.

### Confirmed Code Gaps
1. **Checklist vs. Simulation Story Arc:** Candidates currently work through a flat list of tasks in the global checklist catalog. There is no concept of a cohesive, evolving simulated project or story arc.
2. **Missing Versioning and Candidate Snapshots:** All candidates read from the same global active `TrainingAssignment` catalog. If an admin edits the checklist, it immediately changes the requirements for active candidates mid-trial. We need immutable `TrialProgramVersion` and candidate-specific `CandidateMission` snapshots.
3. **Weak Evidence Enforcement:** Candidate readiness is triggered in [recomputeChecklistReadiness](file:///Users/justinokamoto/code/apps/va-management-next/src/lib/actions/training.ts#L454) solely by checking if all active tasks are marked `done`. In [completeTask](file:///Users/justinokamoto/code/apps/va-management-next/src/lib/actions/training.ts#L537), the `outputLink` and `note` fields are optional. Reviewers cannot enforce evidence approval before final pass.
4. **Hours vs. Output Focus:** The UI and backend tracking still place significant emphasis on logging "10 hours" of time (via `trainingTotalMinutes` and `TrainingSession`), even though checklist completion drives readiness.
5. **Outdated Seed Curriculum:** The seeded tasks in the database still instruct candidates to use external Notion workspaces and Desklog timers rather than practicing directly within the VA Manager's native projects and tasks module.
6. **No AI Coordinator or Conversational Layer:** No automated messaging, deadline reminders, check-in prompts, or feedback loops exist. Everything is coordinated manually by Eunmi/HR.

---

## 3. PRD Document Map and Reading Order

The Skills Trial PRD consists of the following canonical files located in `docs/skills-trial/`:

1. [00-README.md](file:///Users/justinokamoto/code/apps/va-management-next/docs/skills-trial/00-README.md) — Scope Boundary, Document Map, and Gap Inventory.
2. [00-decision-log.md](file:///Users/justinokamoto/code/apps/va-management-next/docs/skills-trial/00-decision-log.md) — Current state of approved, proposed, and unresolved product decisions.
3. [01-product-vision.md](file:///Users/justinokamoto/code/apps/va-management-next/docs/skills-trial/01-product-vision.md) — Foundational philosophy and core vision.
4. [02-candidate-experience.md](file:///Users/justinokamoto/code/apps/va-management-next/docs/skills-trial/02-candidate-experience.md) — The daily rhythm and work-simulation mechanics.
5. [03-ai-system-architecture.md](file:///Users/justinokamoto/code/apps/va-management-next/docs/skills-trial/03-ai-system-architecture.md) — Multi-agent roles and the behavioral evidence graph.
6. [04-behavioral-assessment.md](file:///Users/justinokamoto/code/apps/va-management-next/docs/skills-trial/04-behavioral-assessment.md) — Core competencies, positive signals, and red flags.
7. [05-product-experience-and-culture.md](file:///Users/justinokamoto/code/apps/va-management-next/docs/skills-trial/05-product-experience-and-culture.md) — Aesthetics and cultural alignment guide.
8. [06-mission-engine.md](file:///Users/justinokamoto/code/apps/va-management-next/docs/skills-trial/06-mission-engine.md) — Structuring missions, scenario variants, and branches.
9. [07-project-simulation-engine.md](file:///Users/justinokamoto/code/apps/va-management-next/docs/skills-trial/07-project-simulation-engine.md) — Evolving project storylines and event triggers.
10. [08-ux-ui-design-system.md](file:///Users/justinokamoto/code/apps/va-management-next/docs/skills-trial/08-ux-ui-design-system.md) — Screen hierarchies and specifications based on the v2 prototype.
11. [09-technical-prd.md](file:///Users/justinokamoto/code/apps/va-management-next/docs/skills-trial/09-technical-prd.md) — Schema modifications, routes, background jobs, and API contracts.
12. [10-ai-orchestration-and-prompts.md](file:///Users/justinokamoto/code/apps/va-management-next/docs/skills-trial/10-ai-orchestration-and-prompts.md) — System prompts, tool schemas, and rate limits.
13. [11-mission-content-system.md](file:///Users/justinokamoto/code/apps/va-management-next/docs/skills-trial/11-mission-content-system.md) — Mission Templates and Specialization Challenge details.
14. [12-analytics-evidence-and-calibration.md](file:///Users/justinokamoto/code/apps/va-management-next/docs/skills-trial/12-analytics-evidence-and-calibration.md) — Chronological event mapping, rubrics, and feedback calibration.
15. [13-operations-and-reviewer-sops.md](file:///Users/justinokamoto/code/apps/va-management-next/docs/skills-trial/13-operations-and-reviewer-sops.md) — Recruiter, Reviewer, and Admin workflows.
16. [14-rollout-migration-and-acceptance.md](file:///Users/justinokamoto/code/apps/va-management-next/docs/skills-trial/14-rollout-migration-and-acceptance.md) — Phased rollout roadmap, data migration, and acceptance checklist.

### Appendices:
* [A-traceability-matrix.md](file:///Users/justinokamoto/code/apps/va-management-next/docs/skills-trial/appendices/A-traceability-matrix.md) — Mapping goals to technical specifications.
* [B-state-machines.md](file:///Users/justinokamoto/code/apps/va-management-next/docs/skills-trial/appendices/B-state-machines.md) — Mermaid state diagrams.
* [C-api-and-event-catalog.md](file:///Users/justinokamoto/code/apps/va-management-next/docs/skills-trial/appendices/C-api-and-event-catalog.md) — Endpoint JSON payloads.
* [D-data-model.md](file:///Users/justinokamoto/code/apps/va-management-next/docs/skills-trial/appendices/D-data-model.md) — Extended Prisma schema.
* [E-launch-mission-pack.md](file:///Users/justinokamoto/code/apps/va-management-next/docs/skills-trial/appendices/E-launch-mission-pack.md) — Standardized launch story arc data.
* [F-claude-design-handoff.md](file:///Users/justinokamoto/code/apps/va-management-next/docs/skills-trial/appendices/F-claude-design-handoff.md) — Prompt packet for generating UI components.
