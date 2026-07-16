# Recruitment Form: 4 Fields from Aira's Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add Aira's 4 application-review asks (Jul 16 sync): Family Federation affiliation, referral source, a portfolio-link-accessibility reminder, and visible submission date.

**Architecture:** The apply form is config-driven — `APPLICATION_QUESTIONS` in `src/lib/application-questions.ts` is the single source of truth; the form UI (`ApplyClient`), validation, persistence (`Candidate.applicationJson`), the HR viewer (`ApplicationDetails`), and even the AI screening prompt all iterate it. JSON-blob fields (Case A) = one-file change, no migration. Submission date needs **zero new data** — `Candidate.createdAt` already is it; it only needs display.

**Tech stack:** existing question types (`yes_no`, `short_text`), `help` text pattern, no schema change at all.

---

### Task 1: Two new questions + one help-text edit

**Files:** Modify `src/lib/application-questions.ts` (the `APPLICATION_QUESTIONS` array)

- [ ] Add after the `community` question (keeps org-context questions together):

```ts
{
  key: "ffwpuAffiliated",
  label: "Are you affiliated with the Family Federation (FFWPU)?",
  help: "Either answer is completely fine — this just helps us know our community reach.",
  type: "yes_no",
  required: true,
},
{
  key: "referralSource",
  label: "How did you hear about us? If someone referred you, who?",
  placeholder: "e.g. Facebook post, or referred by Maria Santos",
  type: "short_text",
  required: true,
},
```

- [ ] On the existing portfolio/resume-URL question, extend its `help` to include: `"Make sure the link is set to 'Anyone with the link can view' — we can't review private Drive files."` (several applicants submitted inaccessible links).
- [ ] No other files: validation, `applicationJson` persistence, `ApplicationDetails` HR display, and the AI screener prompt all pick these up automatically.

### Task 2: Highlight the two answers in the recruiter notification email

**Files:** Modify `src/lib/actions/apply.ts` (`notifyTeamLead`, ~line 59-91)

- [ ] The email hardcodes highlighted fields (`address`, `community`, `hasVaExperience`, `skills`) — add `ffwpuAffiliated` and `referralSource` lines so Aira sees them without opening the console.

### Task 3: Show submission date in the review UI

**Files:** Modify `src/app/(app)/recruitment/page.tsx` (+ `gate/page.tsx` if the candidate header there lacks it)

- [ ] `Candidate.createdAt` is the submission timestamp (no separate field exists; nothing to migrate). Verify whether the pipeline card/detail header already renders it; if not, add `Applied <short date>` to the candidate header next to the stage chip, formatted like other dates on the page.

### Task 4: Verify

- [ ] `npm run build`; load `/apply` → both questions render with help text, required-validation fires, submit persists (check `applicationJson` keys `ffwpuAffiliated`/`referralSource`).
- [ ] Recruitment console shows both answers in ApplicationDetails + the Applied date; notification email body includes both lines.

**Estimate:** ~1-2 hours. **Risk:** minimal — config-driven, no migration. Existing candidates simply lack the new keys (viewer already skips empty keys).
