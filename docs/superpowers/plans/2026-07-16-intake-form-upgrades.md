# Discovery Intake Form Upgrades (Attachments + Availability) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Two team-sync asks for the public `/discover` intake: (1) let a lead attach a file (real case: pastor had his own scope-of-work doc), (2) capture scheduling/availability preferences.

**Architecture:** `/discover` is `src/app/discover/DiscoverClient.tsx` + `src/app/api/discover` + `src/lib/discovery-questions.ts`. Availability = one new question field flowing into the lead's stored answers/`leadSummary` (same pattern as existing questions — cheap). Attachments = reuse the **existing R2 presigned-upload pattern** already used for VA profile photos and recordings (`photoKey` flow) — new bucket prefix `discovery/{dealId}/…`, key stored on the Deal, surfaced in the deal drawer. Public-form uploads get strict guards (size, type, count) since this is an unauthenticated surface.

**Tech stack:** existing R2 client + presign helper in the repo, `Deal` JSON/columns, no new deps.

---

### Task 1: Availability question

**Files:** Modify `src/lib/discovery-questions.ts`, `src/app/discover/DiscoverClient.tsx` (only if the form doesn't render questions generically — mirror however existing questions are wired), the discover submit path in `src/lib/actions/discovery.ts`

- [ ] Add a short-text question: "When are you typically available for a call? (days/times, your timezone)" — optional.
- [ ] Ensure the answer lands where sales reads lead context (the `leadSummary`/notes blob shown in the deal drawer) so reps see it when booking.

### Task 2: Attachment upload (public, guarded)

**Files:** Create `src/app/api/discover/attachment/route.ts` · Modify `DiscoverClient.tsx` (file input step), `prisma/schema.prisma` (`Deal.attachmentKeys Json @default("[]")` or single `attachmentKey String?` — decide by reviewing how the drawer will render; start with the Json array, max 3) · migration (headless)

- [ ] Guards, non-negotiable (trust boundary — public form): max 3 files, ≤10 MB each, allowlist `pdf|doc|docx|txt|png|jpg`, presign expiry ≤10 min, key namespaced `discovery/{submissionId}/`, rate-limited like the existing discover submit endpoint.
- [ ] Upload happens AFTER form submit creates the deal (attach-to-deal, not attach-then-orphan): submit returns `dealId`+ presign grant; client uploads directly to R2; confirm endpoint records keys on the deal.
- [ ] Reject-and-continue: upload failure must never block the lead submission itself.

### Task 3: Surface in the sales drawer

**Files:** Modify the deal drawer in `src/components/SalesBoard.tsx` (+ the read in `src/lib/reads/sales.ts`)

- [ ] "Attachments" row listing files with signed GET links (short-lived presigned URLs, staff-only route — never public R2 URLs).

### Task 4: Verify

- [ ] `npm test` + build; E2E: submit `/discover` with a PDF → file appears in the deal drawer and downloads; oversized/wrong-type rejected with a friendly message; submission without attachment unaffected.
- [ ] R2 CORS check for the app origin (known gotcha — recorder hit this; update bucket CORS if the upload 403s from the browser).

**Estimate:** availability ~30 min; attachments ~half day. **Risk:** medium on attachments (public upload surface — the guards above are the mitigation).
