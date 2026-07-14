# Client Discovery Funnel — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the public high-conversion `/discover` lead form that auto-creates a scored `Deal`, and surface the lead score on the sales board — the recruitment-style "website → system" front door for clients.

**Architecture:** Mirror the existing recruitment intake exactly. `discovery-questions.ts` (pure data + validation, shared by UI and server) → `DiscoverClient` one-question-per-screen form → `POST /api/discover` → `submitDiscoveryLead()` creates/updates a `Deal(stage=new, source=native_form)` → best-effort async `scoreAndSaveLead()` (deterministic BANT/fit baseline + OpenAI summary) → score chip on the existing sales board. Booking stays a TidyCal link on the success screen this phase (native booking is Phase 2).

**Tech Stack:** Next.js (App Router), Prisma/Postgres, OpenAI gpt-4o-mini (same `fetch` pattern as recruitment screening), Node built-in test runner (`node --test` via tsx), zod not required (validation mirrors `application-questions.ts`).

**Source files this plan mirrors (read them first):**
- `src/lib/application-questions.ts` → `src/lib/discovery-questions.ts`
- `src/lib/services/application-screen.ts` → `src/lib/services/lead-screen.ts`
- `src/lib/actions/screening.ts` → `src/lib/actions/lead-screening.ts`
- `src/lib/actions/apply.ts` → `src/lib/actions/discovery.ts`
- `src/app/api/apply/route.ts` → `src/app/api/discover/route.ts`
- `src/app/apply/ApplyClient.tsx` → `src/app/discover/DiscoverClient.tsx`
- `tests/application.test.ts` → `tests/discovery.test.ts`, `tests/lead-screen.test.ts`
- `src/components/SalesBoard.tsx` (upgrade in place)

**Design source of truth:** `docs/design/discovery-funnel/PWA Intake High-Conversion.dc.html` (chosen variant) and `docs/superpowers/specs/2026-06-26-client-discovery-funnel-design.md`.

**Run commands (from repo root):**
- Tests: `npm test` (runs `tests/*.test.ts`)
- Single test file: `node --import tsx --test tests/discovery.test.ts`
- Typecheck: `npm run typecheck`
- Migration (dev): `npm run prisma:dev -- --name <name>`

---

## Task 1: Extend the `Deal` model with intake + scoring columns

**Files:**
- Modify: `prisma/schema.prisma` (model `Deal`, around line 1188)
- Generated: Prisma client (via `prisma generate`)

- [ ] **Step 1: Add the new columns to model `Deal`**

In `prisma/schema.prisma`, inside `model Deal { … }`, add these fields immediately after the existing `source` line:

```prisma
  // ── Native discovery funnel: public intake (Phase 1) ──────────────────
  discoveryJson      Json?     // full raw /discover answers (source of truth)
  teamSize           String?
  missionStatement   String?
  hoursPerWeek       String?   // band: "Under 5" | "5–10" | "10–20" | "20+"
  budgetAvailable    String?   // "yes" | "unsure" | "no"
  timeline           String?
  painTags           Json?     // string[]
  triedBefore        String?
  heardAbout         String?
  estimatedAdminCost Int?      // computed cost-of-inaction figure ($/yr)
  fitVerdict         String?   // pre-AI heuristic: "hot" | "warm" | "cold"
  // ── AI lead scoring (mirrors Candidate.screen*) ───────────────────────
  leadVerdict        String?   // "hot" | "warm" | "cold"
  leadScore          Int?      // 0–100
  leadSummary        String?
  leadFlags          Json?     // string[]
  scoredAt           DateTime?
```

- [ ] **Step 2: Create and apply the migration**

Run: `npm run prisma:dev -- --name discovery_lead_capture`
Expected: a new folder under `prisma/migrations/…_discovery_lead_capture/` is created and applied; output ends with "Your database is now in sync with your schema."

- [ ] **Step 3: Verify the Prisma client typechecks with the new fields**

Run: `npm run typecheck`
Expected: PASS (exit 0). The new `Deal` fields are now on the generated client.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(sales): add discovery intake + lead-scoring columns to Deal"
```

---

## Task 2: `discovery-questions.ts` — questions, validation, field mapping, cost + fit helpers

This is the shared pure module (no DB, no network) — the high-conversion question set plus the cost-of-inaction and fit heuristics. Tested first.

**Files:**
- Create: `src/lib/discovery-questions.ts`
- Test: `tests/discovery.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/discovery.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  validateDiscovery,
  dealFieldsFromAnswers,
  estimateAdminCost,
  fitVerdict,
  DISCOVERY_QUESTIONS,
  ROLE_OPTIONS,
} from "../src/lib/discovery-questions";

const base = {
  fullName: "Pastor Daniel Kim",
  orgName: "Riverside Community Church",
  role: "Pastor / Faith Leader",
  email: "dkim@riverside.org",
  teamSize: "6–15",
  mission: "Help our city's families find belonging and hope.",
  painTags: "Scheduling, Admin & email",
  hoursPerWeek: "10–20",
  budgetAvailable: "yes",
  timeline: "ASAP",
  heardAbout: "Referral from a colleague",
};

test("a complete discovery submission validates", () => {
  const r = validateDiscovery(base);
  assert.equal(r.ok, true);
});

test("role must be one of the offered options", () => {
  assert.ok(ROLE_OPTIONS.includes("Founder / CEO"));
  const r = validateDiscovery({ ...base, role: "Wizard" });
  assert.equal(r.ok, false);
});

test("missing required field fails with a helpful message", () => {
  const r = validateDiscovery({ ...base, email: "" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /email/i);
});

test("invalid email is rejected", () => {
  assert.equal(validateDiscovery({ ...base, email: "nope" }).ok, false);
});

test("optional fields can be blank", () => {
  const r = validateDiscovery({ ...base, phone: "", painMore: "", triedBefore: "" });
  assert.equal(r.ok, true);
});

test("dealFieldsFromAnswers maps org/contact + promoted columns", () => {
  const r = validateDiscovery(base);
  assert.equal(r.ok, true);
  if (r.ok) {
    const f = dealFieldsFromAnswers(r.answers);
    assert.equal(f.orgName, "Riverside Community Church");
    assert.equal(f.contactName, "Pastor Daniel Kim");
    assert.equal(f.contactEmail, "dkim@riverside.org");
    assert.equal(f.budgetAvailable, "yes");
    assert.deepEqual(f.painTags, ["Scheduling", "Admin & email"]);
    assert.equal(f.hoursPerWeek, "10–20");
  }
});

test("estimateAdminCost uses band midpoint × rate × 52", () => {
  // "10–20" → midpoint 15h; 15 × 25 × 52 = 19500
  assert.equal(estimateAdminCost("10–20", 25), 19500);
  assert.equal(estimateAdminCost("Under 5", 25), 3900); // 3h
  assert.equal(estimateAdminCost("20+", 25), 32500); // 25h
  assert.equal(estimateAdminCost("nonsense", 25), 0);
});

test("fitVerdict: decision-maker + budget + urgency + hours = hot", () => {
  assert.equal(fitVerdict(base), "hot");
});

test("fitVerdict: no budget = cold regardless of other signals", () => {
  assert.equal(fitVerdict({ ...base, budgetAvailable: "no" }), "cold");
});

test("fitVerdict: just exploring with low hours = cold", () => {
  assert.equal(fitVerdict({ ...base, timeline: "Just exploring", hoursPerWeek: "Under 5" }), "cold");
});

test("every question has a unique key", () => {
  const keys = DISCOVERY_QUESTIONS.map((q) => q.key);
  assert.equal(new Set(keys).size, keys.length);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/discovery.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/discovery-questions'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/discovery-questions.ts`:

```ts
/**
 * Public client-discovery questionnaire — the high-conversion, one-question-at-a-time
 * intake for the /discover funnel. Pure data + helpers, imported by both the public
 * form UI and the server validator so the two never drift. Mirrors
 * application-questions.ts (the recruitment side).
 */

export type QuestionType =
  | "email"
  | "short_text"
  | "long_text"
  | "single_select"
  | "multi_select"
  | "dropdown";

export type DiscoveryQuestion = {
  key: string;
  label: string;
  help?: string;
  type: QuestionType;
  required: boolean;
  placeholder?: string;
  options?: string[];
  allowOther?: boolean;
  showIf?: { key: string; equals: string };
};

export const ROLE_OPTIONS = [
  "Founder / CEO",
  "Executive Director",
  "Director / Program Lead",
  "Pastor / Faith Leader",
  "Operations / Admin",
  "Other",
];

export const TEAM_SIZE_OPTIONS = ["Just me", "2–5", "6–15", "16–50", "50+"];

export const PAIN_OPTIONS = [
  "Admin & email",
  "Scheduling",
  "Bookkeeping",
  "Social media",
  "Data entry",
  "Event coordination",
  "Member / donor follow-up",
];

export const HOURS_OPTIONS = ["Under 5", "5–10", "10–20", "20+"];
export const BUDGET_OPTIONS = ["Yes", "Not sure yet", "No"];
export const TIMELINE_OPTIONS = ["ASAP", "1–3 months", "Just exploring"];
export const HEARD_OPTIONS = [
  "Referral from a colleague",
  "Online search",
  "Social media",
  "Conference or event",
  "Other",
];

export const DISCOVERY_QUESTIONS: readonly DiscoveryQuestion[] = [
  { key: "fullName", label: "First, what's your name?", type: "short_text", required: true, placeholder: "Your full name" },
  { key: "orgName", label: "And your organization?", type: "short_text", required: true, placeholder: "Church, ministry, or organization name" },
  { key: "role", label: "What's your role there?", type: "single_select", required: true, options: ROLE_OPTIONS },
  { key: "email", label: "Where can we reach you?", type: "email", required: true, placeholder: "you@organization.org", help: "We'll only use this to prepare for your call." },
  { key: "phone", label: "A phone number, in case email bounces?", type: "short_text", required: false, placeholder: "(555) 000-0000" },
  { key: "teamSize", label: "How large is your team?", type: "single_select", required: true, options: TEAM_SIZE_OPTIONS },
  { key: "mission", label: "Your mission, in one sentence?", help: "So we can match you with the right kind of support.", type: "long_text", required: true, placeholder: "What you're here to do" },
  { key: "painTags", label: "What's eating most of your time?", help: "Pick all that apply — we'll dig into it on the call.", type: "multi_select", allowOther: true, required: true, options: PAIN_OPTIONS },
  { key: "painMore", label: "Anything you want to add about that?", type: "long_text", required: false, placeholder: "Optional — a sentence or two helps" },
  { key: "hoursPerWeek", label: "Roughly how many hours a week disappear into admin?", type: "single_select", required: true, options: HOURS_OPTIONS },
  { key: "budgetAvailable", label: "If it's the right fit, is funding available to move?", help: "No wrong answer — it just helps us recommend the right option.", type: "single_select", required: true, options: BUDGET_OPTIONS },
  { key: "timeline", label: "When do you want relief?", type: "single_select", required: true, options: TIMELINE_OPTIONS },
  { key: "triedBefore", label: "What have you already tried so far?", type: "long_text", required: false, placeholder: "Optional — tools, hires, systems" },
  { key: "heardAbout", label: "Last one — how did you hear about us?", type: "dropdown", required: true, options: HEARD_OPTIONS },
];

export function isVisible(q: DiscoveryQuestion, answers: Record<string, unknown>): boolean {
  if (!q.showIf) return true;
  return String(answers[q.showIf.key] ?? "") === q.showIf.equals;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type DiscoveryValidation =
  | { ok: true; answers: Record<string, string> }
  | { ok: false; error: string };

export function validateDiscovery(raw: Record<string, unknown>): DiscoveryValidation {
  const answers: Record<string, string> = {};
  for (const q of DISCOVERY_QUESTIONS) {
    if (!isVisible(q, raw)) continue;
    const value = typeof raw[q.key] === "string" ? (raw[q.key] as string).trim() : "";
    if (!value) {
      if (q.required) return { ok: false, error: `Please answer: ${q.label}` };
      continue;
    }
    if (q.type === "email" && !EMAIL_RE.test(value)) return { ok: false, error: "Please enter a valid email address." };
    if ((q.type === "single_select" || q.type === "dropdown") && q.options && !q.options.includes(value)) {
      return { ok: false, error: `Please choose one of the offered options: ${q.label}` };
    }
    answers[q.key] = value;
  }
  return { ok: true, answers };
}

/** Normalize the budget answer to a stored token. */
export function normalizeBudget(value: string): "yes" | "unsure" | "no" {
  const v = (value || "").toLowerCase();
  if (v.startsWith("yes")) return "yes";
  if (v === "no") return "no";
  return "unsure";
}

/** Map validated answers to the Deal columns we store structurally. */
export function dealFieldsFromAnswers(answers: Record<string, string>) {
  const painTags = (answers.painTags || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    orgName: (answers.orgName || "").trim(),
    contactName: (answers.fullName || "").trim() || null,
    contactEmail: (answers.email || "").toLowerCase().trim() || null,
    teamSize: answers.teamSize || null,
    missionStatement: answers.mission || null,
    hoursPerWeek: answers.hoursPerWeek || null,
    budgetAvailable: answers.budgetAvailable ? normalizeBudget(answers.budgetAvailable) : null,
    timeline: answers.timeline || null,
    painTags: painTags.length ? painTags : null,
    triedBefore: answers.triedBefore || null,
    heardAbout: answers.heardAbout || null,
  };
}

const HOURS_MIDPOINT: Record<string, number> = {
  "Under 5": 3,
  "5–10": 7.5,
  "10–20": 15,
  "20+": 25,
};

/** Cost-of-inaction: band midpoint hours × blended admin rate × 52 weeks. */
export function estimateAdminCost(hoursBand: string, rate: number): number {
  const mid = HOURS_MIDPOINT[hoursBand];
  if (!mid || !Number.isFinite(rate) || rate <= 0) return 0;
  return Math.round(mid * rate * 52);
}

/** Pre-AI fit heuristic over the BANT-ish answers. Deterministic + testable. */
export function fitVerdict(answers: Record<string, string>): "hot" | "warm" | "cold" {
  const budget = normalizeBudget(answers.budgetAvailable || "");
  const timeline = answers.timeline || "";
  const hours = answers.hoursPerWeek || "";
  const role = answers.role || "";

  if (budget === "no") return "cold";
  if (timeline === "Just exploring" && (hours === "Under 5" || hours === "5–10")) return "cold";

  const decisionMaker = ["Founder / CEO", "Executive Director", "Director / Program Lead", "Pastor / Faith Leader"].includes(role);
  let pts = 0;
  if (decisionMaker) pts += 1;
  if (budget === "yes") pts += 1;
  if (hours === "20+" || hours === "10–20") pts += 1;
  if (timeline === "ASAP") pts += 1;

  if (pts >= 3 && budget === "yes" && timeline !== "Just exploring") return "hot";
  return "warm";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test tests/discovery.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/discovery-questions.ts tests/discovery.test.ts
git commit -m "feat(sales): discovery questions, validation, cost + fit helpers"
```

---

## Task 3: `lead-screen.ts` — deterministic baseline + AI summary (pure layers tested)

Mirrors `services/application-screen.ts` but for client leads: verdict space is `hot|warm|cold`, baseline uses the BANT/fit heuristic, AI writes a sales-rep summary.

**Files:**
- Create: `src/lib/services/lead-screen.ts`
- Test: `tests/lead-screen.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lead-screen.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import { leadBaseline, blendLead } from "../src/lib/services/lead-screen";

const hot = {
  fullName: "Daniel Kim",
  orgName: "Riverside",
  role: "Pastor / Faith Leader",
  email: "d@r.org",
  teamSize: "6–15",
  mission: "Serve our city.",
  painTags: "Scheduling",
  hoursPerWeek: "20+",
  budgetAvailable: "Yes",
  timeline: "ASAP",
  heardAbout: "Referral from a colleague",
};

test("baseline verdict tracks the fit heuristic", () => {
  assert.equal(leadBaseline(hot).verdict, "hot");
  assert.equal(leadBaseline({ ...hot, budgetAvailable: "No" }).verdict, "cold");
});

test("baseline flags an exploring, no-budget lead", () => {
  const b = leadBaseline({ ...hot, budgetAvailable: "No", timeline: "Just exploring" });
  assert.ok(b.flags.some((f) => /budget|funding/i.test(f)));
});

test("baseline score is higher for hot than cold", () => {
  assert.ok(leadBaseline(hot).score > leadBaseline({ ...hot, budgetAvailable: "No" }).score);
});

test("blendLead keeps a cold floor even if AI is optimistic", () => {
  const base = leadBaseline({ ...hot, budgetAvailable: "No" }); // cold
  const blended = blendLead({ verdict: "hot", score: 95, summary: "Great!", concerns: [] }, base);
  assert.equal(blended.verdict, "cold");
  assert.ok(blended.score <= 40);
});

test("blendLead uses the AI summary when present", () => {
  const base = leadBaseline(hot);
  const blended = blendLead({ verdict: "hot", score: 88, summary: "Strong fit.", concerns: ["needs board sign-off"] }, base);
  assert.equal(blended.summary, "Strong fit.");
  assert.ok(blended.flags.includes("needs board sign-off"));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/lead-screen.test.ts`
Expected: FAIL — `Cannot find module '../src/lib/services/lead-screen'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/services/lead-screen.ts`:

```ts
/**
 * AI scoring of a public client-discovery lead. Two layers (mirrors
 * services/application-screen.ts):
 *  1. Deterministic baseline — the BANT/fit heuristic from discovery-questions,
 *     authoritative for the verdict floor (a no-budget lead can't be waved to "hot").
 *  2. An OpenAI (gpt-4o-mini) pass that writes a short sales-rep summary + concerns.
 */
import { DISCOVERY_QUESTIONS, fitVerdict, normalizeBudget } from "@/lib/discovery-questions";

const OPENAI_KEY = () => process.env.OPENAI_API_KEY;
const OPENAI_MODEL = () => process.env.OPENAI_MODEL || "gpt-4o-mini";

export type LeadVerdict = "hot" | "warm" | "cold";
export type LeadResult = { verdict: LeadVerdict; score: number; summary: string; flags: string[] };

export type LeadBaseline = { verdict: LeadVerdict; score: number; flags: string[] };

const SCORE_BY_VERDICT: Record<LeadVerdict, number> = { hot: 82, warm: 60, cold: 30 };

/** Pure deterministic baseline — no network. */
export function leadBaseline(answers: Record<string, string>): LeadBaseline {
  const verdict = fitVerdict(answers);
  const flags: string[] = [];
  const budget = normalizeBudget(answers.budgetAvailable || "");
  if (budget === "no") flags.push("No funding available to move right now.");
  else if (budget === "unsure") flags.push("Budget / funding not yet confirmed.");
  if (answers.timeline === "Just exploring") flags.push("Just exploring — not on a timeline yet.");
  if (!["Founder / CEO", "Executive Director", "Director / Program Lead", "Pastor / Faith Leader"].includes(answers.role || "")) {
    flags.push("Contact may not be the final decision-maker.");
  }
  return { verdict, score: SCORE_BY_VERDICT[verdict], flags };
}

type AiOut = { verdict: LeadVerdict; score: number; summary: string; concerns: string[] };

/** Blend the AI read with the deterministic baseline (baseline is the floor). */
export function blendLead(ai: AiOut | null, base: LeadBaseline): LeadResult {
  if (!ai) {
    const summary =
      base.verdict === "cold"
        ? `Lower-fit lead. ${base.flags.join(" ")} Worth a light-touch follow-up rather than a full discovery push.`
        : base.verdict === "warm"
          ? `Promising lead with a few open questions. ${base.flags.join(" ") || "Confirm budget and timeline on the call."}`
          : "Strong-fit lead: decision-maker, funding available, real time pain, wants relief soon.";
    return { verdict: base.verdict, score: base.score, summary, flags: base.flags };
  }
  let verdict = ai.verdict;
  // Baseline floor: never upgrade a cold lead, never wave through with a budget=no.
  if (base.verdict === "cold") verdict = "cold";
  else if (verdict === "hot" && base.verdict === "warm" && base.flags.length) verdict = "warm";
  let score = clampScore(ai.score);
  if (base.verdict === "cold") score = Math.min(score, 40);
  const flags = dedupe([...ai.concerns, ...base.flags]);
  return { verdict, score, summary: ai.summary.trim(), flags };
}

/** Run the full screen: deterministic baseline + (optional) OpenAI summary. */
export async function screenLead(answers: Record<string, string>): Promise<LeadResult> {
  const base = leadBaseline(answers);
  const ai = OPENAI_KEY() ? await aiScreen(answers).catch(() => null) : null;
  return blendLead(ai, base);
}

async function aiScreen(answers: Record<string, string>): Promise<AiOut | null> {
  const qa = DISCOVERY_QUESTIONS
    .filter((q) => (answers[q.key] ?? "").trim())
    .map((q) => `${q.label}\n  → ${(answers[q.key] ?? "").trim()}`)
    .join("\n");

  const system = `You qualify inbound leads for Pure Water Automations, which places trained virtual assistants and builds light operations systems for pastors, ministry leaders, and mission-driven organizations. Read the lead's discovery answers and write a tight summary FOR THE SALES REP, plus a fit verdict. Judge on real buying signals: decision-making authority, funding availability, the size/urgency of the admin pain, and timeline. Be fair — small teams and modest budgets can still be great fits.
Return ONLY JSON with this exact shape:
{"verdict":"hot|warm|cold","score":0-100,"summary":"2-3 sentences: who they are, the core pain, and the buying signals/risks","concerns":["short concern","..."]}
verdict: "hot" = decision-maker, funded, real pain, wants relief soon; "warm" = promising with open questions; "cold" = no budget, just browsing, or not the buyer.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${OPENAI_KEY()}` },
    body: JSON.stringify({
      model: OPENAI_MODEL(),
      temperature: 0.2,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Lead answers:\n\n${qa.slice(0, 4000)}` },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const verdict = ["hot", "warm", "cold"].includes(String(parsed.verdict)) ? (parsed.verdict as LeadVerdict) : "warm";
  const summary = typeof parsed.summary === "string" ? parsed.summary : "No summary produced.";
  const concerns = Array.isArray(parsed.concerns) ? parsed.concerns.map(String).filter(Boolean).slice(0, 8) : [];
  return { verdict, score: clampScore(Number(parsed.score)), summary, concerns };
}

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}
function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test tests/lead-screen.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/lead-screen.ts tests/lead-screen.test.ts
git commit -m "feat(sales): lead-screen service (deterministic baseline + AI summary)"
```

---

## Task 4: `lead-screening.ts` action — score one Deal and persist

DB glue (not unit-tested in this codebase — verified by typecheck), mirrors `actions/screening.ts`.

**Files:**
- Create: `src/lib/actions/lead-screening.ts`

- [ ] **Step 1: Write the implementation**

Create `src/lib/actions/lead-screening.ts`:

```ts
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { screenLead } from "@/lib/services/lead-screen";

/** Run AI lead scoring on one Deal's discovery answers and save it. */
export async function scoreAndSaveLead(dealId: string) {
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error(`Deal not found: ${dealId}`);
  if (!deal.discoveryJson) throw new Error("This deal has no discovery submission to score.");

  const answers = deal.discoveryJson as Record<string, string>;
  const result = await screenLead(answers);

  await db.deal.update({
    where: { id: dealId },
    data: {
      leadVerdict: result.verdict,
      leadScore: result.score,
      leadSummary: result.summary,
      leadFlags: result.flags as Prisma.InputJsonValue,
      scoredAt: new Date(),
    },
  });

  await logActivity({
    source: "sales",
    eventType: "lead_screened",
    severity: result.verdict === "cold" ? "warning" : "info",
    summary: `AI scored ${deal.orgName}: ${result.verdict} (${result.score}/100)`,
  });
  return result;
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/lead-screening.ts
git commit -m "feat(sales): scoreAndSaveLead action persists lead score to Deal"
```

---

## Task 5: `discovery.ts` action — submit a lead, create the Deal, notify, score

Mirrors `actions/apply.ts`. DB glue → typecheck-verified.

**Files:**
- Create: `src/lib/actions/discovery.ts`

- [ ] **Step 1: Write the implementation**

Create `src/lib/actions/discovery.ts`:

```ts
/**
 * Native client-discovery intake — accepts a submission from the public /discover
 * funnel and creates (or refreshes) a Deal at stage "new", then kicks off
 * best-effort AI lead scoring. Mirrors actions/apply.ts (the recruitment side).
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logActivity } from "@/lib/activity";
import { sendSystemEmail } from "@/lib/email";
import { loadSettings, num, str } from "@/lib/settings";
import {
  validateDiscovery,
  dealFieldsFromAnswers,
  estimateAdminCost,
  fitVerdict,
} from "@/lib/discovery-questions";
import { scoreAndSaveLead } from "@/lib/actions/lead-screening";

export async function submitDiscoveryLead(raw: Record<string, unknown>) {
  const validation = validateDiscovery(raw);
  if (!validation.ok) throw new Error(validation.error);
  const answers = validation.answers;
  const fields = dealFieldsFromAnswers(answers);
  if (!fields.orgName) throw new Error("Please answer: your organization.");
  if (!fields.contactEmail) throw new Error("Please answer: your email address.");

  const settings = await loadSettings();
  const rate = num(settings, "admin_cost_rate", 25);
  const estimatedAdminCost = answers.hoursPerWeek ? estimateAdminCost(answers.hoursPerWeek, rate) : null;

  const data = {
    orgName: fields.orgName,
    contactName: fields.contactName,
    contactEmail: fields.contactEmail,
    source: "native_form",
    teamSize: fields.teamSize,
    missionStatement: fields.missionStatement,
    hoursPerWeek: fields.hoursPerWeek,
    budgetAvailable: fields.budgetAvailable,
    timeline: fields.timeline,
    painTags: (fields.painTags ?? undefined) as Prisma.InputJsonValue | undefined,
    triedBefore: fields.triedBefore,
    heardAbout: fields.heardAbout,
    estimatedAdminCost,
    fitVerdict: fitVerdict(answers),
    discoveryJson: answers as Prisma.InputJsonValue,
  };

  // Dedupe on contact email (Deal.contactEmail is not unique → findFirst).
  const existing = fields.contactEmail
    ? await db.deal.findFirst({ where: { contactEmail: fields.contactEmail }, select: { id: true } })
    : null;

  let isNew = false;
  let dealId: string;
  if (existing) {
    const updated = await db.deal.update({ where: { id: existing.id }, data: { ...data, lastContactAt: new Date() } });
    dealId = updated.id;
  } else {
    const created = await db.deal.create({ data: { ...data, stage: "new", lastContactAt: new Date() } });
    dealId = created.id;
    isNew = true;
  }

  await logActivity({
    source: "sales_intake",
    eventType: isNew ? "lead_received" : "lead_updated",
    summary: `${isNew ? "New" : "Updated"} discovery lead: ${fields.orgName} (${fields.contactName ?? fields.contactEmail})`,
  });

  if (isNew) await notifySalesOwner(settings, fields, answers, estimatedAdminCost);

  // AI scoring — best-effort, never block the lead's submission.
  void scoreAndSaveLead(dealId).catch(() => {});

  return { ok: true, dealId, isNew };
}

async function notifySalesOwner(
  settings: Map<string, string>,
  fields: ReturnType<typeof dealFieldsFromAnswers>,
  answers: Record<string, string>,
  estimatedAdminCost: number | null,
) {
  try {
    const from = str(settings, "system_email_from");
    const to = str(settings, "sales_owner_email") || str(settings, "hr_manager_email");
    if (!from || !to) return;
    const base = (str(settings, "app_base_url") || env.APP_BASE_URL || "https://team.pwasecondbrain.uk").replace(/\/+$/, "");
    await sendSystemEmail({
      from,
      to,
      subject: `New discovery lead — ${fields.orgName}`,
      body:
        `A new client lead came in through the discovery funnel.\n\n` +
        `Organization: ${fields.orgName}\n` +
        `Contact: ${fields.contactName ?? "(not provided)"} <${fields.contactEmail}>\n` +
        `Role: ${answers.role ?? "(not provided)"}\n` +
        `Team size: ${fields.teamSize ?? "—"}\n` +
        `Pain: ${(fields.painTags ?? []).join(", ") || "—"}\n` +
        `Hours/week on admin: ${fields.hoursPerWeek ?? "—"}\n` +
        `Funding available: ${fields.budgetAvailable ?? "—"}\n` +
        `Timeline: ${fields.timeline ?? "—"}\n` +
        (estimatedAdminCost ? `Est. admin cost: $${estimatedAdminCost.toLocaleString()}/yr\n` : "") +
        `\nReview the pipeline: ${base}/hr/sales`,
    });
  } catch {
    // best-effort — never fail the lead's submission on a mail hiccup
  }
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/actions/discovery.ts
git commit -m "feat(sales): submitDiscoveryLead creates Deal + notifies + scores"
```

---

## Task 6: `POST /api/discover` route

Mirrors `api/apply/route.ts`.

**Files:**
- Create: `src/app/api/discover/route.ts`

- [ ] **Step 1: Write the implementation**

Create `src/app/api/discover/route.ts`:

```ts
import { submitDiscoveryLead } from "@/lib/actions/discovery";

// PUBLIC endpoint — leads are not logged in. Must be added to the Cloudflare
// Access bypass (alongside /discover) so it's reachable without login.
export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    const raw = await request.text();
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return Response.json({ ok: false, error: "Invalid submission." }, { status: 400 });
  }
  try {
    const result = await submitDiscoveryLead(body);
    return Response.json({ ok: true, result });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Submission failed.";
    return Response.json({ ok: false, error }, { status: 400 });
  }
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/discover/route.ts
git commit -m "feat(sales): public POST /api/discover endpoint"
```

---

## Task 7: `DiscoverClient` — the public one-question-per-screen form

Mirrors `ApplyClient.tsx`, driven by `DISCOVERY_QUESTIONS`, with two high-conversion interstitials: a **cost-of-inaction reveal** (after the hours question) and a **fit affirmation + booking handoff** success screen (TidyCal link this phase). Reuses the same field machinery and styles.

**Files:**
- Create: `src/app/discover/DiscoverClient.tsx`
- Create: `src/app/discover/page.tsx`

- [ ] **Step 1: Write `DiscoverClient.tsx`**

Create `src/app/discover/DiscoverClient.tsx`:

```tsx
"use client";

import { useMemo, useState, useRef, useEffect, type CSSProperties, type KeyboardEvent } from "react";
import {
  DISCOVERY_QUESTIONS,
  isVisible,
  estimateAdminCost,
  type DiscoveryQuestion,
} from "@/lib/discovery-questions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
  adminCostRate: number;
  bookingUrl: string | null;
  testimonial: string | null;
};

export function DiscoverClient({ adminCostRate, bookingUrl, testimonial }: Props) {
  const questions = DISCOVERY_QUESTIONS as DiscoveryQuestion[];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [showCost, setShowCost] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const visible = useMemo(() => questions.filter((q) => isVisible(q, answers)), [questions, answers]);
  const clamped = Math.min(idx, Math.max(0, visible.length - 1));
  const q = visible[clamped];
  const total = visible.length;
  const pct = Math.round(((clamped + (done ? 1 : 0)) / total) * 100);

  useEffect(() => {
    if (q && ["short_text", "email", "long_text"].includes(q.type)) inputRef.current?.focus();
  }, [clamped, q?.key]);

  function set(key: string, value: string) {
    setAnswers((a) => ({ ...a, [key]: value }));
    setError("");
  }

  function fieldError(question: DiscoveryQuestion, answersNow: Record<string, string>): string | null {
    const v = (answersNow[question.key] ?? "").trim();
    if (!v) return question.required ? "This one's required." : null;
    if (question.type === "email" && !EMAIL_RE.test(v)) return "That doesn't look like a valid email.";
    return null;
  }

  function advance(answersNow: Record<string, string>, keyNow: string) {
    const cur = questions.find((x) => x.key === keyNow);
    if (cur) {
      const err = fieldError(cur, answersNow);
      if (err) { setError(err); return; }
    }
    setError("");
    // Cost-of-inaction interstitial fires right after the hours question.
    if (keyNow === "hoursPerWeek" && !showCost && estimateAdminCost(answersNow.hoursPerWeek ?? "", adminCostRate) > 0) {
      setShowCost(true);
      return;
    }
    const vis = questions.filter((x) => isVisible(x, answersNow));
    const pos = vis.findIndex((x) => x.key === keyNow);
    if (pos < 0) return;
    if (pos >= vis.length - 1) { void submit(answersNow); return; }
    setIdx(pos + 1);
  }

  function next() { if (q) advance(answers, q.key); }
  function back() { setError(""); if (showCost) { setShowCost(false); return; } if (clamped > 0) setIdx(clamped - 1); }

  function choose(value: string) {
    if (!q) return;
    const na = { ...answers, [q.key]: value };
    setAnswers(na);
    setError("");
    window.setTimeout(() => advance(na, q.key), 140);
  }

  function continueFromCost() {
    setShowCost(false);
    const vis = questions.filter((x) => isVisible(x, answers));
    const pos = vis.findIndex((x) => x.key === "hoursPerWeek");
    if (pos >= 0 && pos < vis.length - 1) setIdx(pos + 1);
    else void submit(answers);
  }

  async function submit(answersNow: Record<string, string> = answers) {
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/discover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(answersNow),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "Network error — please try again." }));
    setSubmitting(false);
    if (!res.ok) { setError(res.error || "Something went wrong. Please try again."); return; }
    setDone(true);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" && !(e.shiftKey && q?.type === "long_text")) {
      e.preventDefault();
      next();
    }
  }

  if (done) {
    return (
      <div style={page}>
        <div style={{ ...card, textAlign: "center", alignItems: "center" }}>
          <div style={{ fontSize: 44 }}>🌊</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)", color: "var(--color-navy-900)", margin: "8px 0 0" }}>
            You&apos;re a strong fit — let&apos;s make this call count.
          </h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-lg)", maxWidth: 460 }}>
            Thanks for sharing. Pick a time for your free 30-minute discovery call and
            we&apos;ll review your answers beforehand — no re-explaining, no pitch.
          </p>
          {bookingUrl ? (
            <a href={bookingUrl} target="_blank" rel="noreferrer" style={{ ...okBtn, textDecoration: "none", marginTop: 8 }}>
              Book my free call →
            </a>
          ) : (
            <p style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-md)" }}>
              We&apos;ll email you shortly to schedule your call.
            </p>
          )}
          {testimonial && <blockquote style={quote}>{testimonial}</blockquote>}
        </div>
      </div>
    );
  }

  if (showCost) {
    const cost = estimateAdminCost(answers.hoursPerWeek ?? "", adminCostRate);
    return (
      <div style={page}>
        <div style={progressTrack}><div style={{ ...progressBar, width: `${pct}%` }} /></div>
        <div style={{ ...card, textAlign: "center", alignItems: "center" }}>
          <div style={qNum}>Here&apos;s what that&apos;s costing</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 56, fontWeight: 800, color: "var(--color-navy-900)", lineHeight: 1 }}>
            ${cost.toLocaleString()}
          </div>
          <div style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-lg)", maxWidth: 420 }}>
            an estimate of the yearly cost of those admin hours at a typical rate — time that could go back to your mission.
          </div>
          <button onClick={continueFromCost} style={{ ...okBtn, marginTop: 18 }}>Keep going →</button>
          <button onClick={back} style={{ ...linkBtn }}>Back</button>
        </div>
      </div>
    );
  }

  if (!q) return <div style={page} />;
  const isChoice = q.type === "yes_no" || q.type === "single_select";

  return (
    <div style={page}>
      <div style={progressTrack}><div style={{ ...progressBar, width: `${pct}%` }} /></div>
      <div style={card}>
        <div style={qNum}>{clamped + 1} <span style={{ opacity: 0.5 }}>of {total}</span></div>
        <label htmlFor={q.key} style={qLabel}>{q.label}{q.required && <span style={{ color: "var(--color-sky-500)" }}> *</span>}</label>
        {q.help && <div style={qHelp}>{q.help}</div>}
        <div style={{ marginTop: 18 }}>
          <Field q={q} value={answers[q.key] ?? ""} onChange={(v) => set(q.key, v)} onChoose={choose} onKey={onKey} inputRef={inputRef} />
        </div>
        {error && <div style={errStyle}>{error}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22 }}>
          {!isChoice && (
            <button onClick={next} disabled={submitting} style={okBtn}>
              {submitting ? "Submitting…" : clamped >= total - 1 ? "See my results" : "OK"}
            </button>
          )}
          {!isChoice && <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>press <strong>Enter ↵</strong></span>}
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button onClick={back} disabled={clamped === 0} style={navBtn(clamped === 0)} aria-label="Back">↑</button>
            <button onClick={next} disabled={submitting} style={navBtn(false)} aria-label="Next">↓</button>
          </div>
        </div>
      </div>
      <div style={brand}>Pure Water Automations · Refreshing leaders. Removing burdens.</div>
    </div>
  );
}

function Field({
  q, value, onChange, onChoose, onKey, inputRef,
}: {
  q: DiscoveryQuestion;
  value: string;
  onChange: (v: string) => void;
  onChoose: (v: string) => void;
  onKey: (e: KeyboardEvent) => void;
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
}) {
  if (q.type === "single_select" && q.options) {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        {q.options.map((opt) => (
          <button key={opt} onClick={() => onChoose(opt)} style={{ ...choiceBtn, ...(value === opt ? choiceActive : {}), justifyContent: "flex-start" }}>{opt}</button>
        ))}
      </div>
    );
  }
  if (q.type === "multi_select") {
    return <MultiSelect options={q.options ?? []} allowOther={q.allowOther} value={value} onChange={onChange} onKey={onKey} inputRef={inputRef} />;
  }
  if (q.type === "dropdown") {
    return (
      <select id={q.key} value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
        <option value="">Select…</option>
        {(q.options ?? []).map((o) => (<option key={o} value={o}>{o}</option>))}
      </select>
    );
  }
  if (q.type === "long_text") {
    return (
      <textarea
        id={q.key}
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={value}
        placeholder={q.placeholder ?? "Type your answer… (Shift+Enter for a new line)"}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKey}
        style={{ ...inputBase, minHeight: 110, resize: "vertical" }}
      />
    );
  }
  return (
    <input
      id={q.key}
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type={q.type === "email" ? "email" : "text"}
      value={value}
      placeholder={q.placeholder ?? "Type your answer…"}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKey}
      style={inputBase}
    />
  );
}

function MultiSelect({
  options, allowOther, value, onChange, onKey, inputRef,
}: {
  options: string[];
  allowOther?: boolean;
  value: string;
  onChange: (v: string) => void;
  onKey: (e: KeyboardEvent) => void;
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
}) {
  const parts = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const selected = parts.filter((p) => options.includes(p));
  const other = parts.filter((p) => !options.includes(p)).join(", ");
  const [otherOn, setOtherOn] = useState(Boolean(other));

  function rebuild(sel: string[], oth: string) {
    const all = [...sel, ...(oth.trim() ? [oth.trim()] : [])];
    onChange(all.join(", "));
  }
  function toggle(opt: string) {
    const sel = selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt];
    rebuild(sel, other);
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
        {options.map((opt) => {
          const on = selected.includes(opt);
          return (
            <button key={opt} onClick={() => toggle(opt)} style={{ ...checkBtn, ...(on ? choiceActive : {}), fontWeight: on ? 700 : 400 }}>
              <span style={{ marginRight: 8 }}>{on ? "☑" : "☐"}</span>{opt}
            </button>
          );
        })}
        {allowOther && (
          <button onClick={() => setOtherOn((v) => !v)} style={{ ...checkBtn, ...(otherOn ? choiceActive : {}), fontWeight: otherOn ? 700 : 400 }}>
            <span style={{ marginRight: 8 }}>{otherOn ? "☑" : "☐"}</span>Other…
          </button>
        )}
      </div>
      {allowOther && otherOn && (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={other}
          placeholder="Tell us what else (comma-separated)"
          onChange={(e) => rebuild(selected, e.target.value)}
          onKeyDown={onKey}
          style={{ ...inputBase, marginTop: 12, fontSize: "var(--text-lg)" }}
        />
      )}
    </div>
  );
}

const page: CSSProperties = { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, background: "linear-gradient(180deg, var(--color-sky-50), var(--color-bg-secondary))" };
const progressTrack: CSSProperties = { position: "fixed", top: 0, left: 0, right: 0, height: 6, background: "var(--color-bg-tertiary)" };
const progressBar: CSSProperties = { height: "100%", background: "linear-gradient(90deg, var(--color-sky-400), var(--color-navy-700))", transition: "width 0.3s ease" };
const card: CSSProperties = { width: "100%", maxWidth: 640, background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-lg)", padding: "36px 40px", display: "flex", flexDirection: "column" };
const qNum: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", color: "var(--color-sky-600)", fontWeight: 700, marginBottom: 8 };
const qLabel: CSSProperties = { fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)", color: "var(--color-navy-900)", lineHeight: 1.25, fontWeight: 700 };
const qHelp: CSSProperties = { marginTop: 8, color: "var(--color-text-secondary)", fontSize: "var(--text-md)" };
const selectStyle: CSSProperties = { width: "100%", border: "1.5px solid var(--color-sky-300)", borderRadius: "var(--radius-input)", padding: "12px 14px", font: "inherit", fontSize: "var(--text-lg)", color: "var(--color-navy-900)", background: "var(--color-surface)", outline: "none" };
const inputBase: CSSProperties = { width: "100%", border: "none", borderBottom: "2px solid var(--color-sky-300)", background: "transparent", padding: "8px 2px", font: "inherit", fontSize: "var(--text-xl)", color: "var(--color-navy-900)", outline: "none" };
const okBtn: CSSProperties = { border: "none", borderRadius: 9999, padding: "12px 26px", background: "var(--color-navy-900, #132272)", color: "#fff", fontWeight: 700, fontSize: "var(--text-md)", cursor: "pointer" };
const linkBtn: CSSProperties = { border: "none", background: "transparent", color: "var(--color-text-tertiary)", fontSize: "var(--text-sm)", cursor: "pointer", marginTop: 10 };
const choiceBtn: CSSProperties = { flex: 1, border: "1.5px solid var(--color-border)", borderRadius: 12, padding: "16px 18px", background: "var(--color-surface)", cursor: "pointer", fontSize: "var(--text-lg)", color: "var(--color-navy-900)", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s ease" };
const checkBtn: CSSProperties = { border: "1.5px solid var(--color-border)", borderRadius: 10, padding: "11px 14px", background: "var(--color-surface)", cursor: "pointer", fontSize: "var(--text-md)", color: "var(--color-navy-900)", display: "flex", alignItems: "center", textAlign: "left", transition: "all 0.15s ease" };
const choiceActive: CSSProperties = { borderColor: "var(--color-navy-700, #132272)", background: "var(--color-sky-50)", boxShadow: "0 0 0 3px var(--color-sky-100)" };
const errStyle: CSSProperties = { marginTop: 12, color: "var(--color-error, #b42318)", fontSize: "var(--text-sm)", fontWeight: 600 };
const brand: CSSProperties = { marginTop: 20, fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", letterSpacing: "0.04em" };
const quote: CSSProperties = { marginTop: 20, fontStyle: "italic", color: "var(--color-text-secondary)", fontSize: "var(--text-md)", maxWidth: 440, borderLeft: "3px solid var(--color-sky-300)", paddingLeft: 14, textAlign: "left" };
function navBtn(disabled: boolean): CSSProperties {
  return { width: 38, height: 38, borderRadius: 8, border: "1px solid var(--color-border)", background: disabled ? "var(--color-bg-tertiary)" : "var(--color-navy-900, #132272)", color: disabled ? "var(--color-text-tertiary)" : "#fff", cursor: disabled ? "default" : "pointer", fontSize: 16, fontWeight: 700 };
}
```

- [ ] **Step 2: Write the public `page.tsx`**

Create `src/app/discover/page.tsx`:

```tsx
import { DiscoverClient } from "./DiscoverClient";
import { db } from "@/lib/db";

// PUBLIC page (outside the (app) auth shell). Add /discover + /api/discover to the
// Cloudflare Access bypass so they're reachable without a login.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Discover — Pure Water Automations",
  description: "A quick conversation about getting your time back. Book a free discovery call.",
};

export default async function DiscoverPage() {
  let adminCostRate = 25;
  let bookingUrl: string | null = null;
  let testimonial: string | null = null;
  try {
    const rows = await db.setting.findMany({
      where: { key: { in: ["admin_cost_rate", "discovery_booking_url", "discovery_testimonials"] } },
      select: { key: true, value: true },
    });
    const map = new Map(rows.map((r) => [r.key, (r.value ?? "").trim()]));
    const rate = Number(map.get("admin_cost_rate"));
    if (Number.isFinite(rate) && rate > 0) adminCostRate = rate;
    bookingUrl = map.get("discovery_booking_url") || null;
    testimonial = map.get("discovery_testimonials") || null;
  } catch {
    // fall back to defaults if the DB is unreachable
  }
  return <DiscoverClient adminCostRate={adminCostRate} bookingUrl={bookingUrl} testimonial={testimonial} />;
}
```

- [ ] **Step 3: Verify it typechecks and builds**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/discover/DiscoverClient.tsx src/app/discover/page.tsx
git commit -m "feat(sales): public /discover high-conversion form + cost reveal"
```

---

## Task 8: Surface the lead score on the sales board (Option A — score-forward)

Add the AI score + summary + source to the board. The board's data comes from the HR sales page loader; add the new fields there and render a score chip + summary line per deal.

**Files:**
- Modify: `src/components/SalesBoard.tsx`
- Modify: `src/app/(app)/hr/sales/page.tsx` (the loader that builds `DealRow[]`)

- [ ] **Step 1: Read the loader to find the deal query**

Run: `sed -n '1,80p' "src/app/(app)/hr/sales/page.tsx"`
Expected: shows the `db.deal.findMany(...)` select and the mapping into the `DealRow[]` passed to `<SalesBoard deals=… />`. Note the exact shape so the next step matches it.

- [ ] **Step 2: Extend the `DealRow` type and render the score**

In `src/components/SalesBoard.tsx`, extend the `DealRow` type (after the `agreement` field):

```ts
  source: string | null;
  leadVerdict: string | null;
  leadScore: number | null;
  leadSummary: string | null;
  discoveryCallAt?: string | null;
```

Then, inside the deal-name cell (the first `<td>`), add the score chip + summary directly under the org name. Replace this block:

```tsx
                <td style={{ padding: 8 }}>
                  <div style={{ fontWeight: 600 }}>{d.orgName}</div>
                  <div className="small">{d.contactName || ""} {d.contactEmail ? `· ${d.contactEmail}` : ""}</div>
                  <div className="small">{d.packageName || "—"}{d.dealValue ? ` · $${d.dealValue.toLocaleString()}` : ""}{d.billingType ? ` · ${d.billingType}` : ""}</div>
                </td>
```

with:

```tsx
                <td style={{ padding: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {d.leadVerdict && <ScoreChip verdict={d.leadVerdict} score={d.leadScore} />}
                    <span style={{ fontWeight: 600 }}>{d.orgName}</span>
                    {d.source === "native_form" && <span style={tagStyle}>discover</span>}
                  </div>
                  <div className="small">{d.contactName || ""} {d.contactEmail ? `· ${d.contactEmail}` : ""}</div>
                  {d.leadSummary && <div className="small" style={{ color: "var(--text-secondary,#666)", maxWidth: 420 }}>{d.leadSummary}</div>}
                  <div className="small">{d.packageName || "—"}{d.dealValue ? ` · $${d.dealValue.toLocaleString()}` : ""}{d.billingType ? ` · ${d.billingType}` : ""}</div>
                </td>
```

Add these helpers at the bottom of the file (next to `Badge`):

```tsx
function ScoreChip({ verdict, score }: { verdict: string; score: number | null }) {
  const c =
    verdict === "hot" ? { bg: "#d4f5e2", fg: "#1a7a4a" } :
    verdict === "warm" ? { bg: "#fff3d4", fg: "#966200" } :
    { bg: "#e8e8ed", fg: "#48484a" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: 9999, fontSize: 11, fontWeight: 700, background: c.bg, color: c.fg, textTransform: "capitalize" }}>
      {verdict}{typeof score === "number" ? ` ${score}` : ""}
    </span>
  );
}

const tagStyle: CSSProperties = { padding: "1px 7px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: "var(--color-sky-100, #c4eef9)", color: "var(--color-sky-800, #0d5e7e)", textTransform: "uppercase", letterSpacing: "0.04em" };
```

And add `CSSProperties` to the React import at the top of the file:

```tsx
import { useState, type CSSProperties } from "react";
```

- [ ] **Step 3: Include the new fields in the loader query + mapping**

In `src/app/(app)/hr/sales/page.tsx`, add `source: true, leadVerdict: true, leadScore: true, leadSummary: true` to the `db.deal.findMany({ select: { … } })` call, and include them in the object mapped into each `DealRow` (matching the names used in Step 2). If the loader uses `include`/full rows instead of `select`, the fields are already present — just add them to the mapped row object.

- [ ] **Step 4: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/SalesBoard.tsx "src/app/(app)/hr/sales/page.tsx"
git commit -m "feat(sales): show AI lead score + summary on the sales board"
```

---

## Task 9: Seed the new settings + backfill worker

Add default settings rows and a backfill worker that scores any unscored native-form leads (mirrors `worker/application-screen.ts`), so leads that missed inline scoring still get scored.

**Files:**
- Create: `worker/lead-screen.ts`
- Modify: `package.json` (add `worker:lead-screen` script)

- [ ] **Step 1: Read the recruitment worker to mirror its shape**

Run: `cat worker/application-screen.ts`
Expected: shows the loop that finds unscreened candidates and calls `screenAndSaveCandidate`. Mirror its structure (db query loop + per-row call + console summary).

- [ ] **Step 2: Write the backfill worker**

Create `worker/lead-screen.ts`:

```ts
/**
 * Backfill AI scoring for native-form discovery leads that were not scored inline
 * (e.g. the OpenAI key was missing at submit time). Mirrors worker/application-screen.ts.
 * Run via: npm run worker:lead-screen
 */
import { db } from "@/lib/db";
import { scoreAndSaveLead } from "@/lib/actions/lead-screening";

async function main() {
  // Note: filter on source + scoredAt only (avoid Prisma's Json-null filter
  // quirk). scoreAndSaveLead throws for a lead with no discoveryJson; we catch it.
  const leads = await db.deal.findMany({
    where: { source: "native_form", scoredAt: null },
    select: { id: true, orgName: true },
    take: 50,
  });
  console.log(`lead-screen: ${leads.length} unscored lead(s).`);
  for (const lead of leads) {
    try {
      const r = await scoreAndSaveLead(lead.id);
      console.log(`  ✓ ${lead.orgName}: ${r.verdict} (${r.score})`);
    } catch (err) {
      console.warn(`  ✗ ${lead.orgName}:`, err instanceof Error ? err.message : err);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Add the worker script to `package.json`**

In `package.json` `scripts`, add (next to `"worker:screen"`):

```json
    "worker:lead-screen": "tsx worker/lead-screen.ts",
```

- [ ] **Step 4: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Seed default settings (run once against the dev DB)**

The funnel reads three new settings; insert sensible defaults. Run:

```bash
node --import tsx -e "(async()=>{const {db}=await import('./src/lib/db');const up=(key,value)=>db.setting.upsert({where:{key},create:{key,value},update:{}});await Promise.all([up('admin_cost_rate','25'),up('discovery_booking_url',''),up('discovery_testimonials','“They gave us back twelve hours a week in the first month — and the team actually feels it.” — Pastor D. Kim, Riverside Community Church'),up('sales_owner_email','')]);console.log('seeded');process.exit(0)})()"
```

Expected: prints `seeded`. (Leave `discovery_booking_url` / `sales_owner_email` blank to fill in the admin UI later.)

- [ ] **Step 6: Commit**

```bash
git add worker/lead-screen.ts package.json
git commit -m "feat(sales): lead-score backfill worker + default funnel settings"
```

---

## Task 10: Cloudflare Access bypass + smoke test the whole flow

- [ ] **Step 1: Add `/discover` and `/api/discover` to the Access bypass**

These are public (no login), exactly like `/apply` + `/api/apply`. Find where the apply paths are bypassed and add the discover paths alongside.

Run: `grep -rn "/apply" --include=*.ts --include=*.json --include=*.md . | grep -iv node_modules | grep -iE "bypass|access|public|middleware"`
Expected: locates the bypass list (middleware matcher or the Cloudflare Access config note). Add `/discover` and `/api/discover` to the same list. If the bypass is managed in Cloudflare's dashboard (not in-repo), note it in the deploy checklist instead and skip the code edit.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — including `tests/discovery.test.ts` and `tests/lead-screen.test.ts`, and no regressions in existing tests.

- [ ] **Step 3: Manual smoke test against the dev server**

Run: `npm run dev` then, in a second shell:

```bash
curl -s localhost:3032/api/discover -H 'content-type: application/json' \
  -d '{"fullName":"Test Pastor","orgName":"Smoke Test Church","role":"Pastor / Faith Leader","email":"smoke@example.org","teamSize":"6–15","mission":"Serve the city.","painTags":"Scheduling, Admin & email","hoursPerWeek":"20+","budgetAvailable":"Yes","timeline":"ASAP","heardAbout":"Referral from a colleague"}'
```

Expected: `{"ok":true,"result":{"ok":true,"dealId":"…","isNew":true}}`. Then open `http://localhost:3032/discover` in a browser, complete the flow, and confirm the cost-reveal screen appears after the hours question and the "strong fit" success screen appears at the end.

- [ ] **Step 4: Verify the lead landed scored on the board**

Open `http://localhost:3032/hr/sales` (logged in). Expected: the "Smoke Test Church" deal appears at stage `new` with a `discover` tag and, within a few seconds (after async scoring), a `hot`/`warm` score chip + an AI summary line. If the score is missing (no `OPENAI_API_KEY` locally), run `npm run worker:lead-screen` and refresh — a deterministic-baseline score appears.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore(sales): Cloudflare Access bypass for /discover + smoke-test notes"
```

---

## Definition of done (Phase 1)

- `npm test` passes, including the two new test files.
- `npm run typecheck` passes.
- A public submission to `/discover` creates a `Deal(stage=new, source=native_form)` with promoted columns + `discoveryJson`, an `estimatedAdminCost`, and a `fitVerdict`.
- The lead is AI-scored (inline best-effort; backfilled by `worker:lead-screen`) and the score chip + summary show on `/hr/sales`.
- The public form shows the cost-of-inaction reveal and the fit-affirmation success screen with a booking link (TidyCal this phase).
- `/discover` + `/api/discover` are on the Cloudflare Access bypass.

## Not in Phase 1 (later phases)

- Native multi-rep discovery booking + `/discovery/[token]` (Phase 2) — booking is a TidyCal link on the success screen for now.
- Structured discovery-call notes capture (Phase 3).
- `SALES` role + dedicated `/sales` console (Phase 4) — Phase 1 reuses the existing `/hr/sales` board.
