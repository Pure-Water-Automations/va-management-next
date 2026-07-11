# PWA Skills Trial — Phase 9: Technical PRD & Integration Architecture

This document defines the database schema updates, system services, API endpoints, and permission structures required to support the PWA Skills Trial in the Next.js/Postgres application.

---

## 1. Architectural Strategy
We will extend the existing monorepo architecture of `va-management-next` rather than spinning up new microservices.
* **Source of Truth:** Postgres (accessed via Prisma Client).
* **Work Execution:** Next.js Server Actions and Route Handlers (`src/app/api/trials/*`).
* **Timer Operations:** Native client-side state combined with stateless server-side start/stop endpoints that calculate delta durations in the backend to prevent clock manipulation.
* **Sync & Reminders:** Systemd timers run background tsx scripts (e.g. daily timer, mirror timer). We will introduce a systemd timer worker for AI checks.

---

## 2. Authentication & Permission Model

### Candidate Authentication
We reuse the existing candidate magic-link strategy:
* Candidates are assigned a unique, cryptographically secure `trainingAccessToken` (generated as a `UUIDv4` in [preTrialGate](file:///Users/justinokamoto/code/apps/va-management-next/src/lib/actions/recruitment.ts#L231)).
* The candidate accesses the console via `GET /track/[token]`. No password or OAuth is required for the candidate during the trial.
* Session validation checks that the Candidate's `currentStage` is exactly `tenhr_in_progress`. Magic links for failed or passed candidates automatically deny access, redirecting to a completion status page.

### Roles and Guardrails
* **Candidate Permissions:** Can read their assigned step snapshot, start/stop timers, post submissions, send messages, and toggle check-in forms. They cannot access other candidates' data, rubrics, or raw AI evaluation parameters.
* **Reviewer / Recruiter Permissions:** Access through NextAuth-gated dashboards (`/recruitment/gate`). Can read candidates' evidence packets, compare resubmissions, adjust rubric values, and submit final decisions.
* **Admin Permissions:** Access to program settings and template management.

---

## 3. Database Schema Design (Prisma)
We will extend `prisma/schema.prisma` with versioned templates and candidate snapshots.

```prisma
// Extension of the Candidate Model
model Candidate {
  // ... existing fields ...
  trainingAccessToken    String?   @unique
  currentStage           CandidateStage @default(applied)
  
  // New Relations for the Skills Trial
  trial                  CandidateTrial?
}

// Represents one active instance of a trial program for a candidate
model CandidateTrial {
  id                  String             @id @default(cuid())
  candidateId         String             @unique
  candidate           Candidate          @relation(fields: [candidateId], references: [candidateId], onDelete: Cascade)
  programVersionId    String
  programVersion      TrialProgramVersion @relation(fields: [programVersionId], references: [id])
  startDate           DateTime           @default(now())
  deadlineDate        DateTime
  activeSeconds       Int                @default(0) // total compiled duration of timers
  status              TrialStatus        @default(ACTIVE) // ACTIVE | SUBMITTED | REVISION | COMPLETED
  timezone            String             @default("GMT+8")
  declaredDays        String             @default("Mon,Tue,Wed,Thu,Fri") // comma separated
  declaredBlock       String             @default("Morning") // Morning | Afternoon | Evening
  
  missions            CandidateMission[]
  events              TrialEvent[]
  conversations       TrialConversation[]
}

// Represents one version of the trial program
model TrialProgramVersion {
  id                  String             @id @default(cuid())
  versionNumber       Int                @unique
  name                String             @default("V2 Simulated Work Week")
  active              Boolean            @default(true)
  createdAt           DateTime           @default(now())
  
  templates           MissionTemplate[]
  trials              CandidateTrial[]
}

// Holds templates for each of the 9 simulated steps
model MissionTemplate {
  id                  String             @id @default(cuid())
  programVersionId    String
  programVersion      TrialProgramVersion @relation(fields: [programVersionId], references: [id], onDelete: Cascade)
  sortOrder           Int                @default(0)
  key                 String             // e.g. "mission", "sim", "sop", "meet"
  title               String
  kind                String             // learn | tour | sim | branch | sop | meet | reflect
  kindLabel           String             // ORIENTATION | CLIENT WORK | SYSTEMS | TEAM | REFLECTION
  estMinutes          Int
  dayDue              Int
  clientName          String
  story               String             @db.Text
  deliverableText     String
  instructionsText    String             @db.Text
  
  candidatesMissions  CandidateMission[]
}

// Candidate-specific snapshot of a mission template
model CandidateMission {
  id                  String             @id @default(cuid())
  trialId             String
  trial               CandidateTrial     @relation(fields: [trialId], references: [id], onDelete: Cascade)
  templateId          String
  template            MissionTemplate    @relation(fields: [templateId], references: [id])
  status              MissionStatus      @default(NOT_STARTED) // NOT_STARTED | IN_PROGRESS | SUBMITTED | NEEDS_REVISION | APPROVED
  secondsSpent        Int                @default(0)
  startedAt           DateTime?
  completedAt         DateTime?
  
  // Submission values
  submittedText1      String?            @db.Text // message to client / comment
  submittedText2      String?            @db.Text // announcement draft / SOP field JSON
  submittedLink       String?
  revisionPlan        String?            @db.Text // revision ETA plan
  
  // Feedback snapshot
  feedbackJson        Json?              // { obs, impact, sugg, enc }
}

enum TrialStatus {
  ACTIVE
  SUBMITTED
  REVISION
  COMPLETED
}

enum MissionStatus {
  NOT_STARTED
  IN_PROGRESS
  SUBMITTED
  NEEDS_REVISION
  APPROVED
}

// Persistent chronological timeline events
model TrialEvent {
  id                  String             @id @default(cuid())
  trialId             String
  trial               CandidateTrial     @relation(fields: [trialId], references: [id], onDelete: Cascade)
  timestamp           DateTime           @default(now())
  day                 Int
  actor               String             // System | Candidate | AI | Human
  label               String             @db.Text
}

// Conversation thread groupings
model TrialConversation {
  id                  String             @id @default(cuid())
  trialId             String
  trial               CandidateTrial     @relation(fields: [trialId], references: [id], onDelete: Cascade)
  actorType           String             // Purii | Sarah | Emily | Michael | Human
  
  messages            TrialMessage[]
}

model TrialMessage {
  id                  String             @id @default(cuid())
  conversationId      String
  conversation        TrialConversation  @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  timestamp           DateTime           @default(now())
  day                 Int
  from                String             // purii | me | human
  text                String             @db.Text
  tag                 String?            // Subtitle like "AI feedback" or "Human · J. Okamoto"
}
