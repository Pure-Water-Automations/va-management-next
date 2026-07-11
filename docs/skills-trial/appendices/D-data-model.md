# PWA Skills Trial — Appendix D: Data Model

This document maps the Prisma relational data structures added to support versioning, step snapshots, availability windows, timelines, messages, and reviewer rubrics.

---

## 1. Relational Entity Relationship Diagram (ERD)

```
┌───────────────────┐        ┌─────────────────────┐
│    Candidate      │◄───────┤   CandidateTrial    │
│  - candidateId    │  1:1   │  - id               │
│  - email          │        │  - status           │
└───────────────────┘        └──────────┬──────────┘
                                        │
                                        ├──────────────────────┐
                                        │ 1:N                  │ 1:N
                               ┌────────▼─────────┐   ┌────────▼─────────┐
                               │CandidateMission  │   │   TrialEvent     │
                               │ - id             │   │  - id            │
                               │ - status         │   │  - label         │
                               └────────▲─────────┘   └──────────────────┘
                                        │ 1:1
                               ┌────────┴─────────┐
                               │ MissionTemplate  │
                               │ - title          │
                               │ - story          │
                               └──────────────────┘
```

---

## 2. Model Schema Specification

### TrialProgramVersion
* Defines one snapshot of the trial program, preventing changes mid-trial.
* **Fields:**
  * `id`: `String @id @default(cuid())`
  * `versionNumber`: `Int @unique` (e.g. `2`)
  * `name`: `String` (e.g. `V2 Simulated Work Week`)
  * `active`: `Boolean @default(true)`
  * `createdAt`: `DateTime @default(now())`

### MissionTemplate
* Holds templates for the 9 steps in the trial program.
* **Fields:**
  * `id`: `String @id @default(cuid())`
  * `programVersionId`: `String` (references `TrialProgramVersion.id`)
  * `sortOrder`: `Int @default(0)`
  * `key`: `String` (e.g. `"sim"`)
  * `title`: `String` (e.g. `"Community Impact Day"`)
  * `kind`: `String` (e.g. `"sim"`)
  * `kindLabel`: `String` (e.g. `"CLIENT WORK"`)
  * `estMinutes`: `Int` (e.g. `105`)
  * `dayDue`: `Int` (e.g. `2`)
  * `clientName`: `String` (e.g. `"Grace Community Center"`)
  * `story`: `String @db.Text`
  * `deliverableText`: `String`
  * `instructionsText`: `String @db.Text`

### CandidateTrial
* Holds the candidate-specific trial state, availability windows, timezone, and progress rollups.
* **Fields:**
  * `id`: `String @id @default(cuid())`
  * `candidateId`: `String @unique` (references `Candidate.candidateId`)
  * `programVersionId`: `String` (references `TrialProgramVersion.id`)
  * `startDate`: `DateTime @default(now())`
  * `deadlineDate`: `DateTime`
  * `activeSeconds`: `Int @default(0)`
  * `status`: `TrialStatus @default(ACTIVE)`
  * `timezone`: `String @default("GMT+8")`
  * `declaredDays`: `String` (comma-separated list, e.g. `"Mon,Tue,Wed,Thu"`)
  * `declaredBlock`: `String` (Morning, Afternoon, Evening)

### CandidateMission
* Stores the candidate's output and AI feedback for a specific step.
* **Fields:**
  * `id`: `String @id @default(cuid())`
  * `trialId`: `String` (references `CandidateTrial.id`)
  * `templateId`: `String` (references `MissionTemplate.id`)
  * `status`: `MissionStatus @default(NOT_STARTED)`
  * `secondsSpent`: `Int @default(0)`
  * `startedAt`: `DateTime?`
  * `completedAt`: `DateTime?`
  * `submittedText1`: `String? @db.Text` (message / comment)
  * `submittedText2`: `String? @db.Text` (draft)
  * `submittedLink`: `String?`
  * `revisionPlan`: `String? @db.Text`
  * `feedbackJson`: `Json?` (keys: `obs`, `impact`, `sugg`, `enc`)

### TrialEvent
* Persistent chronological log of all timeline events.
* **Fields:**
  * `id`: `String @id @default(cuid())`
  * `trialId`: `String` (references `CandidateTrial.id`)
  * `timestamp`: `DateTime @default(now())`
  * `day`: `Int`
  * `actor`: `String` (System, Candidate, AI, Human)
  * `label`: `String @db.Text`
