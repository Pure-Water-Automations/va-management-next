# PWA Skills Trial — Appendix A: Traceability Matrix

This matrix maps high-level goals and user needs to specific system requirements, database models, APIs, and verification strategies.

| Goal / User Need | System Requirement | Data Model | API / Event | Verification Test |
|---|---|---|---|---|
| **Identify Reliable Candidates** | Measure check-in response latency inside declared working windows. | `CandidateTrial`, `TrialEvent` | `POST /api/trials/message/reply`, `CHECKIN_SUBMITTED` | `tests/trial-availability.test.ts` |
| **Observe Ownership** | Monitor blocker reporting and the implementation of resubmission plans. | `CandidateMission`, `TrialEvent` | `POST /api/trials/escalate`, `BLOCKER_REPORTED` | `tests/trial-engine.test.ts` |
| **Measure Coachability** | Store side-by-side versions of initial and revised client simulation drafts. | `CandidateMission` | `POST /api/trials/step/submit`, `REVISION_SUBMITTED` | `tests/trial-gate.test.ts` |
| **Protect Human Control** | Enforce human signatures on final gate decisions in the database. | `Candidate`, `Evaluation` | `POST /api/trials/review` | `tests/trial-gate.test.ts` |
| **Ensure Fair Scoring** | Exclude accommodation requests and technical errors from AI rubric suggestions. | `CandidateTrial`, `TrialEvent` | `POST /api/trials/escalate`, `HUMAN_ESCALATED` | `tests/trial-fairness.test.ts` |
| **Consolidate Tooling** | Seed missions directly into VA Manager Projects/Tasks. | `MissionTemplate`, `CandidateMission` | `GET /api/trials/steps` | `tests/trial-engine.test.ts` |
| **Prevent Content Leakage** | Implement versioned scenario templates and assignment snapshots. | `TrialProgramVersion`, `MissionTemplate` | `POST /api/trials/initialize` | `tests/trial-engine.test.ts` |
| **Zero Production Downtime** | UI branching to render legacy checklist for Version 1 candidates. | `CandidateTrial` | `GET /track/[token]` | Manual verification on dev subdomain. |
