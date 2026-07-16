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
  { key: "email", label: "What's the best email to reach you?", type: "email", required: true, placeholder: "you@organization.org", help: "We'll only use this to prepare for your call." },
  { key: "phone", label: "A phone number, in case email bounces?", type: "short_text", required: false, placeholder: "(555) 000-0000" },
  { key: "teamSize", label: "How large is your team?", type: "single_select", required: true, options: TEAM_SIZE_OPTIONS },
  { key: "mission", label: "Your mission, in one sentence?", help: "So we can match you with the right kind of support.", type: "long_text", required: true, placeholder: "What you're here to do" },
  { key: "painTags", label: "What's eating most of your time?", help: "Pick all that apply — we'll dig into it on the call.", type: "multi_select", allowOther: true, required: true, options: PAIN_OPTIONS },
  { key: "painMore", label: "Anything you want to add about that?", type: "long_text", required: false, placeholder: "Optional — a sentence or two helps" },
  { key: "hoursPerWeek", label: "Roughly how many hours a week disappear into admin?", type: "single_select", required: true, options: HOURS_OPTIONS },
  { key: "budgetAvailable", label: "If it's the right fit, is funding available to move?", help: "No wrong answer — it just helps us recommend the right option.", type: "single_select", required: true, options: BUDGET_OPTIONS },
  { key: "timeline", label: "When do you want relief?", type: "single_select", required: true, options: TIMELINE_OPTIONS },
  { key: "availability", label: "When are you typically available for a call? (days/times, your timezone)", type: "short_text", required: false, placeholder: "Optional — e.g. weekdays after 2 PM Eastern" },
  { key: "triedBefore", label: "What have you already tried so far?", type: "long_text", required: false, placeholder: "Optional — tools, hires, systems" },
  { key: "heardAbout", label: "How did you hear about us?", type: "dropdown", required: true, options: HEARD_OPTIONS },
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
    // Cap stored length — this is a public, unauthenticated endpoint, so bound
    // the per-field size to keep the row (and the discoveryJson blob) small.
    const cap = q.type === "long_text" ? 2000 : 300;
    const value = (typeof raw[q.key] === "string" ? (raw[q.key] as string).trim() : "").slice(0, cap);
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
  // Clamp below Postgres int4 max — estimatedAdminCost is an Int column and a
  // fat-fingered admin_cost_rate setting must not overflow the insert.
  return Math.min(Math.round(mid * rate * 52), 2_000_000_000);
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

  // "hot" requires an actual decision-maker — a strong-but-non-buyer contact is
  // at most "warm" (keeps this consistent with leadBaseline's decision-maker flag).
  if (pts >= 3 && decisionMaker && budget === "yes" && timeline !== "Just exploring") return "hot";
  return "warm";
}
