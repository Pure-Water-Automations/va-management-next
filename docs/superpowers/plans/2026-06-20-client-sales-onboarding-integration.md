# Client Sales & Onboarding Integration — Plan

- **Date:** 2026-06-20
- **Status:** Draft (for review)
- **Author:** Justin + Claude
- **Scope:** Bring the client-facing sales→signed→paid→onboarded lifecycle into the
  VA Management Console, reusing existing infrastructure, while keeping the
  top-of-funnel CRM where it already works (Notion).

---

## 1. Context

Two SOPs describe how PWA turns a lead into a working client:

1. **"Convert a lead to a signed PWA client"** (current) — the sales pipeline:
   Pipeline Tracking deal stages (`New → Discovery Scheduled → Discovery Completed
   → Proposal Needed → Proposal Sent → Negotiation → Verbal Yes → Won` /
   `Lost` / `Nurture` / `No-Show`), prospect intake form → auto-created deal,
   qualification, discovery call, same-day follow-up offer, **signed + paid before
   any work begins**, a "Contract + Payment Complete → Create Client" automation,
   and a Sales-to-Onboarding handoff summary.
2. **"Onboard clients"** (older, "Needs Review") — Discovery → Proposal → Sign &
   Pay → **Intake Form (Formly / Google Sheet)** → **Onboarding Call (TidyCal)**,
   plus the contract key terms (monthly billed in advance, 30-day notice, unused
   hours non-refundable, client owns deliverables, NDA/confidentiality, NY law).

Today **all of this lives outside the app**: Notion (Pipeline Tracking + Clients
DB + objection library), BunnyDoc (e-sign — note: dormant/no API), Stripe, TidyCal,
Formly, Google Drive/Sheets. The app's only client footprint is the **Client
Portal** (orgs, memberships, task requests, projects/tasks) which begins *after* a
client is already active.

### What the app already has that we can reuse

The bottom of the funnel is mostly **already built** — for VA recruitment, not
clients — and is directly reusable:

| Capability | Where | Reuse for clients |
|---|---|---|
| **In-app e-signer** (tokenized public `/sign/[token]`, typed + drawn signature, audit trail, single-use token) | `src/app/sign/*`, `src/app/api/sign/*`, `src/lib/actions/contract.ts` | Client service agreement signing — replaces the dead **BunnyDoc** step in both SOPs |
| **Contract render + PDF + archive** (HTML template w/ merge fields, `@react-pdf/renderer`, Drive upload, email w/ attachment) | `src/lib/contract/{template.ts,pdf.tsx,store.ts,seed-template.ts}` | Client agreement PDF, Drive archive, email to client + Team Lead |
| **Onboarding model + checklist + completion hook** | `Onboarding` model, `src/lib/actions/onboarding.ts`, `src/app/api/hr/checklist/*` | Parallel `ClientOnboarding` checklist + completion → activate org |
| **Client Portal** (org, membership, role-gated access, task requests, projects/tasks) | `ClientOrganization`, `ClientMembership`, `src/app/(client)/*`, `src/lib/auth/client.ts` | The created client *is* a portal org; onboarding provisions portal access |
| **Tokenized public intake form** (Typeform-style application) | `src/app/apply/*`, `Candidate.applicationJson` | Client **intake form** — replaces Formly/Google Sheet |
| **System email** (Gmail send, attachments, templates, test mode) | `src/lib/` email + `/admin/email` | Proposal/welcome/recap emails, contract delivery |
| **Settings-driven config + admin editors** | `Setting`, `/admin/contract`, `/admin/email` | Client agreement template + terms, package catalog |
| **Notion one-way refs + Sheet mirror** | `NotionRef`, `worker/sheet-mirror-export.ts`, `Client.notionId` | Keep Notion Pipeline in sync (app ↔ Notion) |
| **Stripe (MCP/API) connected** | Stripe connector | Payment: retainer subscription, deposit invoice, or saved card for hourly auto-charge |
| **MCP endpoint + systemd workers/timers** | `src/app/api/mcp`, `worker/*`, daily timer | AI-driven deal/onboarding actions + reminder/nudge automations |

### The gap

The app has **no concept of a sales deal/lead**, and **no client-side contract,
payment, or onboarding** objects. The "Won → Create Client → Onboard" handoff —
the exact seam the SOP calls out — is a manual Notion automation today.

---

## 2. Guiding decision: what moves into the app vs. stays in Notion

We do **not** rebuild a CRM. Notion is good at the top-of-funnel (nurture, notes,
objection library, flexible deal pages) and the team already lives there. We move
into the app only the parts that (a) must be **reliably enforced** ("no work until
signed + paid"), (b) the app **already has machinery for** (e-sign, payments,
portal, onboarding checklists, projects/tasks), or (c) need to be the **system of
record for delivery**.

**Stays in Notion (system of record for the funnel):**
- Lead capture, prospect intake form → deal, qualification, discovery scheduling
  (TidyCal), discovery call notes, proposal drafting, follow-up cadence, objection
  library, Nurture/Lost handling.

**Moves into the app (system of record for the contract→client→delivery seam):**
- The **service agreement e-sign** (replacing BunnyDoc).
- **Payment** capture/confirmation (Stripe) and the **signed + paid gate**.
- **Client record creation** = provision a `ClientOrganization` + portal access.
- **Client onboarding** (intake form, checklist, onboarding-call tracking, handoff
  summary, owner, status Onboarding → Active).

**The bridge:** a lightweight **Deal mirror** in the app so a Notion "Verbal Yes"
deal can be handed to the app to drive sign+pay+onboard, with stage changes synced
back to Notion (one-way app→Notion, same pattern as the Sheet mirror). The
authoritative pipeline stays in Notion; the app owns the closing mechanics.

---

## 3. Data model additions (one migration per phase)

```prisma
// ── Sales bridge ───────────────────────────────────────────────
enum DealStage {
  new
  discovery_scheduled
  discovery_completed
  proposal_needed
  proposal_sent
  negotiation
  verbal_yes
  won
  lost
  nurture
  no_show
}

model Deal {
  id                String     @id @default(cuid())
  notionPageId      String?    @unique          // link to Pipeline Tracking page
  orgName           String
  contactName       String?
  contactEmail      String?
  source            String?
  accountOwnerEmail String?
  stage             DealStage  @default(new)
  package           String?
  dealValue         Decimal?
  startDate         DateTime?
  handoffSummary    Json?                        // the Client Handoff Summary block
  agreement         ClientAgreement?
  clientOrgId       String?    @unique           // set when Won → org created
  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt
  @@index([stage])
}

// ── Client service agreement (generalized e-signer) ────────────
enum ClientAgreementStatus { draft sent viewed signed paid active void }

model ClientAgreement {
  id             String   @id @default(cuid())
  dealId         String   @unique
  deal           Deal     @relation(fields: [dealId], references: [id])
  signToken      String?  @unique            // single-use, mirrors contractSignToken
  status         ClientAgreementStatus @default(draft)
  packageName    String?
  priceLabel     String?                     // e.g. "$X/mo, billed in advance"
  billingType    String?                     // retainer | hourly | project
  termsHash      String?                     // sha256 of rendered agreement HTML
  sentAt         DateTime?
  signedAt       DateTime?
  signerName     String?
  signerEmail    String?
  signerIp       String?
  userAgent      String?
  signatureImage String?  @db.Text
  pdfDriveFileId String?
  pdfWebViewLink String?
  // Payment (Stripe)
  stripeCustomerId     String?
  stripeSubscriptionId String?
  stripeInvoiceId      String?
  paidAt               DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

// ── Client onboarding (mirrors VA Onboarding) ──────────────────
enum ClientOnboardingStatus { pending in_progress completed }

model ClientOnboarding {
  id                   String   @id @default(cuid())
  clientOrganizationId String   @unique
  clientOrganization   ClientOrganization @relation(fields: [clientOrganizationId], references: [id])
  owner                String?                  // onboarding owner email
  intakeToken          String?  @unique         // public intake form link
  intakeJson           Json?                    // submitted intake answers
  status               ClientOnboardingStatus @default(pending)
  // checklist (from the Onboarding SOP + handoff)
  intakeReceived       Boolean @default(false)
  onboardingCallBooked Boolean @default(false)
  onboardingCallDone   Boolean @default(false)
  driveFolderCreated   Boolean @default(false)
  portalAccessGranted  Boolean @default(false)
  commsCadenceSet      Boolean @default(false)
  firstWeekPriorities  Boolean @default(false)
  vaAssigned           Boolean @default(false)
  kickoffRecapSent     Boolean @default(false)
  notes                String?
  updatedAt            DateTime @updatedAt
}
```

`ClientOrganization` already exists with `status ClientOrgStatus { active paused
churned }`; add `onboarding` to that enum (or gate "active" on onboarding
completion). The existing thin `Client` sync model is left as-is (Notion mirror)
or folded into `Deal`/`ClientOrganization` later.

---

## 4. Phased delivery

Each phase is independently shippable and reuses existing patterns. Phases 1–2 are
the highest leverage (they remove the BunnyDoc dead-end and enforce the core gate).

### Phase 1 — Generalize the e-signer to client agreements ★ highest value
Refactor `src/lib/contract/*` so the signer is not candidate-bound:
- Extract a `signableSubject` abstraction (today: `Candidate`; add: `Deal`/
  `ClientAgreement`). `/sign/[token]` and `/api/sign/[token]` resolve either.
- New **client agreement template** Setting (`client_agreement_template_html`)
  seeded with the SOP's key terms (monthly billed in advance, 30-day notice,
  unused hours non-refundable, deliverable ownership, confidentiality/NDA, NY law),
  plus merge fields: `{{client}} {{package}} {{price}} {{billing}} {{start_date}}
  {{company}} {{date}}`. Editor under `/admin/client-agreement` (mirrors
  `/admin/contract`).
- `sendClientAgreement(dealId)` → generate token, status `sent`, email the signing
  link. On sign: render PDF, archive to Drive (`signed_client_contracts_folder_id`),
  email client + Team Lead, write signature/audit fields, status `signed`.
- Keep the HR "mark signed" manual fallback for offline signers.

### Phase 2 — Payment + the signed-and-paid gate (Stripe)
- On `signed`, create/lookup a Stripe **Customer**; then per `billingType`:
  - **retainer:** create a subscription (or first invoice billed in advance),
  - **hourly:** save a payment method + record auto-charge authorization,
  - **project:** issue a deposit invoice.
- Stripe **webhook** route (`/api/stripe/webhook`) → set `paidAt`, advance status
  to `paid`. A deal is only **`won`** when `signed && paid`.
- Surface payment state on the deal/agreement; reuse email test-mode guard.

### Phase 3 — Won → Create Client (the in-app handoff automation)
Replace the Notion "Contract + Payment Complete → Create Client" automation:
- `convertDealToClient(dealId)` (auto-fires when `signed && paid`, also callable
  manually + via the MCP endpoint): create a `ClientOrganization` (slug from name),
  attach the **handoff summary**, set status `onboarding`, create a
  `ClientOnboarding` row, assign onboarding owner, create the client's Google Drive
  folder, and write a `NotionRef` + sync stage `won` back to the Notion deal page.
- Idempotent on `Deal.clientOrgId` (mirrors the candidate-provisioning idempotency).

### Phase 4 — Client onboarding module
- **In-app intake form** at `/intake/[token]` (public, tokenized — same pattern as
  `/apply`): contact info, priority tasks, tools, comms preferences, stakeholders.
  Submission writes `ClientOnboarding.intakeJson`, flips `intakeReceived`, notifies
  owner. **Replaces the Formly form + Google Sheet.**
- **Onboarding checklist UI** for Team Lead/Onboarding owner (mirror the HR
  onboarding checklist + toggle routes). Completion (`markClientOnboardingComplete`)
  sets org status `active`, provisions portal `ClientMembership`(s) + sends portal
  welcome, logs `ActivityLog`.
- Onboarding-call tracking (TidyCal link stored; booked/done flags; recap email).

### Phase 5 — Sales/onboarding surface + automations + Notion sync
- **Internal dashboard** under `(app)` (Team Lead): deals needing action, awaiting
  signature, awaiting payment, in onboarding, with the SOP's required-fields and
  special-deal (`Team Lead Review Needed/Approved`) flags.
- **Reminder worker** (extend the daily timer): follow-up-date-due nudges,
  signature/payment chasers (uses the stored `contractDeadline`-style deadline),
  onboarding stalls.
- **Notion bridge:** import a deal from a Notion page (paste URL → create `Deal`),
  and mirror app stage changes back to the Notion deal (one-way, like the Sheet
  mirror worker). Pipeline stays authoritative in Notion; closing mechanics in app.
- **MCP tools:** `list_deals`, `create_deal`, `send_client_agreement`,
  `convert_deal_to_client` so the AI sales assistant can drive the closing steps.

---

## 5. What explicitly stays manual / in Notion (for now)
- Lead capture, prospect intake → deal creation, qualification, discovery
  scheduling (TidyCal), discovery call notes, proposal **drafting**, nurture/lost,
  objection library. (Notion + AI call notes remain the system of record.)
- Proposal *delivery* can stay email/Canva/Loom; the app only needs the deal to
  reach "Verbal Yes" before it takes over sign+pay+onboard.

---

## 6. Sequencing & milestones
1. **M1 (Phases 1):** Clients can sign a real agreement in-app; BunnyDoc dead-end
   removed. (Mostly refactor of existing signer — fastest win.)
2. **M2 (Phase 2):** Signed-and-paid gate enforced via Stripe.
3. **M3 (Phase 3):** Won deals auto-create a portal-ready client + handoff.
4. **M4 (Phase 4):** In-app intake form + onboarding checklist → client goes Active.
5. **M5 (Phase 5):** Dashboard, reminders, Notion two-way bridge, MCP tools.

Each milestone: Prisma migration + seed settings, node-test coverage matching the
existing suite (template/PDF/guard/action tests), and `/admin` config where needed.

## 7. Risks / open questions
- **Stripe billing shape** — retainer subscription vs. invoice-in-advance vs. saved
  card for hourly auto-charge. Need the canonical package/billing matrix (the
  Service Options deck) to model `package`/`billingType`.
- **Notion sync direction** — recommend one-way app→Notion for stages the app owns
  (signed/paid/won/onboarding) to avoid conflict loops; confirm acceptable.
- **Deal entry point** — auto-import from Notion vs. create deal in-app at "Verbal
  Yes". Recommend a manual "import from Notion deal URL" first; full two-way later.
- **Contract terms authority** — the in-app template must be legal-reviewed before
  it replaces BunnyDoc for real client signatures.
- **Cloudflare/Access** — `/sign/*`, `/intake/*`, `/api/stripe/webhook` must be on
  the public bypass (no Google login), same as `/apply`.

## 8. Source documents
- SOP — *Convert a lead to a signed PWA client* (Notion `379063b66bf181f9ad2de444ce08ccfe`)
- SOP — *Onboard clients* (Notion `344063b66bf180c1b4fbd2fd843668ba`)
- Prior specs reused: `2026-06-15-contract-esign-and-onboarding-fix-design.md`,
  `2026-06-18-client-portal-design.md`
