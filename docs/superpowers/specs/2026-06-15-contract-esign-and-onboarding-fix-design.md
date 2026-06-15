# In-app contract e-signing + onboarding completion fix — design

- Date: 2026-06-15
- Status: approved (pending spec review)
- Author: Justin + Claude
- Scope: two deliverables in one implementation cycle

## Context

The recruitment pipeline has two confirmed gaps (found during the 2026-06-15
console analysis):

1. **Contract "sent" is a no-op.** `markContractSent` sets `contractStatus="sent"`
   and a deadline but never sends anything. The intended provider, BunnyDoc, is a
   dormant stub (`src/lib/bunnydoc.ts` returns `{dormant:true}` for both
   `sendSignatureRequest` and `subscribeWebhook`), and **BunnyDoc does not offer
   API access**, so it cannot be activated. Contracts are sent and signed entirely
   out-of-band today; the app only records a manual "mark signed" click.
2. **Onboarding is a dead end.** When HR completes the 9-item onboarding checklist
   (`onboarding.markComplete`), nothing happens downstream: the candidate
   `currentStage` stays `onboarding` forever and the VA receives no welcome.

This spec replaces the dead BunnyDoc path with a **self-contained, in-app
e-signer** built on the app's existing tokenized-public-page pattern, and fixes
the onboarding dead end.

## Goals

- "Send contract" emails the candidate a real signing link.
- The candidate signs in-app (no login) with a recorded audit trail.
- Signing produces a signed PDF, archives/emails it, and auto-provisions the VA.
- Completing onboarding advances the pipeline and welcomes the new VA.
- Zero new always-on services; no Chromium; reuse existing infrastructure.

## Non-goals

- Multi-party / counter-signing (HR does not counter-sign in v1).
- Formal compliance certificates or tamper-evident cryptographic sealing beyond
  the recorded audit metadata + template hash.
- Replacing the existing manual "Mark signed" HR fallback (it stays).
- A full WYSIWYG template editor (v1 is a plain textarea on an admin page).

## Locked decisions

1. **Approach:** build the signer in-app (not self-hosted DocuSeal, not a SaaS).
2. **Contract content:** an editable **HTML template** stored in a `Setting`, with
   merge fields, rendered per candidate.
3. **PDF rendering:** `@react-pdf/renderer` (pure JS, no Chromium). The template
   supports a **clean HTML subset** — `h1`–`h3`, `p`, `ul`/`ol`/`li`, `strong`,
   `em`, `br`, `hr` — not arbitrary CSS.
4. **Signed-PDF storage:** always email a copy to the candidate + HR; **also**
   archive to a Google Drive folder when `signed_contracts_folder_id` is set
   (best-effort, no-ops gracefully if unset).
5. **Template editing:** seed a sensible default template + add a small textarea
   editor under `/admin/contract` (mirrors the `/admin/email` admin page).
6. **Scope:** both deliverables (e-signer + onboarding fix) in this cycle.

## Deliverable 1 — in-app e-signer

### User flow (★ = new behavior)

1. **Recruiter → Send contract** (`/recruitment`, stage must be `tenhr_pass`).
   `markContractSent(candidateId)`:
   - generates `contractSignToken = randomUUID()` (matches `trainingAccessToken`),
   - sets `contractStatus="sent"`, `contractSentAt=now`,
     `contractDeadline=now + contract_deadline_days`, `currentStage="contract_sent"`,
   - ★ **emails the candidate** the link `${APP_BASE_URL}/sign/{token}` via
     `sendSystemEmail` (best-effort; logged).
2. **Candidate → opens `/sign/[token]`** (public, no login; same pattern as
   `/track/[token]`). Server renders the contract HTML (template + merge fields
   filled). Client (`SignClient.tsx`) shows:
   - the rendered contract (read-only),
   - a typed **full legal name** field (required),
   - an optional **drawn signature** canvas (`signature_pad`),
   - an **"I have read and agree"** checkbox (required),
   - a **Sign** button (disabled until name + checkbox present).
3. **Candidate → Sign** → `POST /api/sign/[token]` (public). Server:
   - re-validates: token exists, `currentStage==="contract_sent"`, not past
     `contractDeadline`, not already signed,
   - captures `signerName`, `signatureImage` (data URL or empty), `signerIp`
     (`cf-connecting-ip` || first `x-forwarded-for`), `userAgent`, `signedAt`,
     `templateHash` (sha256 hex of the rendered contract HTML),
   - generates the **signed PDF** (`lib/contract/pdf.ts`),
   - writes a `ContractSignature` row,
   - **best-effort:** uploads the PDF to Drive (if configured) and emails it to
     candidate + HR,
   - runs the existing provisioning (`markContractSigned` internals): create/link
     the `Va` (status `training`), create the `Onboarding` row (`pending`), set
     candidate `signedAt`, `contractStatus="signed"`, `currentStage="onboarding"`,
     email HR the onboarding notification,
   - returns success → client shows a confirmation screen.
4. **HR fallback:** the existing **"Mark signed"** button (`markContractSigned`)
   stays unchanged for candidates who sign offline.

### Guards / edge cases

- Invalid / unknown token → friendly "link not valid" page.
- Past `contractDeadline` → "this link has expired, contact HR" page.
- Already signed (token consumed / `currentStage` past `contract_sent`) →
  "already signed" confirmation, not an error.
- Re-`POST` after signing → rejected idempotently (provisioning is already
  idempotent for a linked `vaId`).
- Token is single-use: on success it is cleared (`contractSignToken=null`) so the
  link cannot be reused.

### Data model (one Prisma migration)

```prisma
model Candidate {
  // ...existing...
  contractSignToken String? @unique   // signing credential, set on send, cleared on sign
}

model ContractSignature {
  id             String   @id @default(cuid())
  candidateId    String   @unique
  signerName     String
  signerEmail    String
  signedAt       DateTime @default(now())
  signerIp       String?
  userAgent      String?
  signatureImage String?  // data URL of the drawn signature, if provided
  templateHash   String   // sha256 of the rendered contract HTML at sign time
  pdfDriveFileId String?
  pdfWebViewLink String?
  createdAt      DateTime @default(now())
}
```

### Modules (each one job; unit-testable in isolation)

- `lib/contract/template.ts` — pure. `renderContract(templateHtml, vars) → html`.
  `vars`: `{ name, role, rate, date, deadline, company }`. Merge tokens:
  `{{name}} {{role}} {{rate}} {{date}} {{deadline}} {{company}}`. Unknown tokens
  render empty; provides `contractVarsForCandidate(candidate, settings) → vars`:
  - `name` = `candidate.name`
  - `role` = the `contract_role_label` setting (default "Virtual Assistant") —
    candidates are hired as a trainee VA, so this is a fixed label, not the comp
    enum,
  - `rate` = the `TRAINEE` `CompensationRole.hourlyRate` formatted as currency
    (e.g. `$6.00/hr`); blank if the trainee role has no hourly rate,
  - `date` = today (`signedAt` on the signed copy), `deadline` =
    `contractDeadline`, both formatted `YYYY-MM-DD`,
  - `company` = `company_name` setting (default "Pure Water Automations").
- `lib/contract/pdf.ts` — `generateSignedPdf({ contentHtml, signature, audit }) →
  Promise<Buffer>` using `@react-pdf/renderer`. Maps the supported HTML subset to
  react-pdf primitives, then appends a signature block (typed name + drawn image
  if present + date) and an audit footer (IP, user-agent, template hash,
  candidate id, signed-at). Pagination/wrapping handled by react-pdf.
- `lib/contract/store.ts` — `deliverSignedContract(buffer, candidate, settings) →
  { driveFileId?, webViewLink? }`. Best-effort Drive upload (service account,
  `@googleapis/drive`, into `signed_contracts_folder_id`; filename
  `Contract - {name} - {YYYY-MM-DD}.pdf`) + emails the PDF to the candidate and to
  the same HR recipients `emailOnboardingNotification` resolves (`hr_manager_email`
  / `people_ops_email` settings). Never throws; returns what succeeded.
- `lib/actions/contract.ts` — `getSignState(token)` (read for the page) and
  `signContract(token, { signerName, signatureImage, agree }, reqMeta) → result`
  (the public signing action). Plus the `markContractSent` email change (kept in
  `recruitment.ts` next to the existing logic, calling a shared
  `sendContractLinkEmail`).
- `app/sign/[token]/page.tsx` (thin server page) + `app/sign/[token]/SignClient.tsx`
  (client UI) — mirror `app/track/[token]/`.
- `app/api/sign/[token]/route.ts` — public `POST` (plain handler, no `action()`
  wrapper; same shape as `/api/apply/route.ts`), reads request body + headers,
  calls `signContract`.
- `app/(app)/admin/contract/page.tsx` + a small client form — admin-only
  (`user.isAdmin`) textarea editor for `contract_template_html` with a live
  preview rendered against a sample candidate, + the list of supported merge
  tokens. POSTs to a guarded `saveContractTemplate` action.

### Email attachment support (prerequisite sub-task)

`sendSystemEmail` currently has no attachment support (`SystemEmailOptions` is
`from/to/subject/body/htmlBody/tokenFile`; the MIME builder emits
`multipart/alternative` only). Extend it:

- add `attachments?: { filename: string; content: Buffer; mimeType: string }[]`,
- when attachments are present, wrap the existing alternative part in a
  `multipart/mixed` envelope and append each attachment as a base64 part
  (`Content-Disposition: attachment; filename="..."`). RFC-2047 encode the
  filename if non-ASCII (the builder already encoded-word-encodes the subject).

This is additive and does not change existing call sites.

### Settings / env additions

- `contract_template_html` (Setting) — seeded with a default VA engagement letter.
- `company_name` (Setting) — default "Pure Water Automations".
- `signed_contracts_folder_id` (Setting or env) — optional Drive archive folder.
- Reuses existing: `contract_deadline_days`, `system_email_from`,
  HR recipient settings, `APP_BASE_URL`, Google service-account creds.

## Deliverable 2 — onboarding completion fix

In `lib/actions/onboarding.ts`, `markComplete(vaId)` — after setting
`Onboarding.status="completed"`:

- find the linked `Candidate` (`where vaId == this va`); if found and
  `currentStage === "onboarding"`, set `currentStage="closed"` (pipeline done),
- send the VA a welcome email (`sendSystemEmail` to `va.email`; best-effort),
- `logActivity({ source:"onboarding", eventType:"onboarding_completed", vaId })`.

The VA's `status` stays `training` — becoming `active` is evaluation-gated
(`approveEvaluation`), which is intentionally unchanged.

## Error handling

- **Email + Drive are best-effort.** Signing and provisioning succeed even if
  delivery/archive fail; failures are logged and surfaced in `ActivityLog`. This
  matches the existing worker pattern.
- **PDF generation is in-process and required**: it runs before the
  `ContractSignature` write + provisioning commit, so a generation failure aborts
  cleanly with a retryable error to the candidate (nothing partially provisioned).
- **Idempotency:** a second successful submit is impossible (token cleared); a
  race re-`POST` is rejected by the stage/`signedAt` check, and provisioning is
  idempotent for an already-linked `vaId`.

## Testing (node test runner, `tests/*.test.ts`, matches existing 22 tests)

- `template.test.ts` — merge-field substitution, unknown-token blanking,
  `contractVarsForCandidate` rate/company resolution.
- `contract-pdf.test.ts` — `generateSignedPdf` returns a non-empty PDF buffer
  with the `%PDF` header and contains the signer name + audit fields.
- `sign-guard.test.ts` — token validation matrix: valid, unknown, expired,
  already-signed, wrong-stage (mocked db).
- `sign-action.test.ts` — `signContract` happy path provisions a VA + writes a
  `ContractSignature` + clears the token (mocked db / pdf / mail).
- `onboarding-complete.test.ts` — `markComplete` advances candidate stage to
  `closed` and triggers the welcome (mocked db / mail).

## Deploy notes

- New deps: `pdf-lib`, `signature_pad`, `@react-pdf/renderer`.
- **Cloudflare Access bypass:** add `/sign/*` and `/api/sign/*` to the Access
  bypass policy (alongside `/apply`), or candidates can't reach the signing page.
- Run the Prisma migration (`prisma migrate deploy`) and seed the new settings.
- No new systemd unit / always-on process.

## Future (out of scope for v1)

- WYSIWYG template editor; multiple contract templates per role.
- HR counter-signature; reminder emails on `contractDeadline` approach (the
  deadline is stored but not yet enforced by a worker).
- Cryptographic sealing / formal audit certificate.
