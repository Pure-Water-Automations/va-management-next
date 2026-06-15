/**
 * AI first-pass screening of a VA application. Two layers:
 *  1. Deterministic checks (pure, no network) — catch empty / gibberish /
 *     low-effort / missing-resume submissions even when the AI is unavailable.
 *  2. An OpenAI (gpt-4o-mini) pass that reads the answers and writes a short
 *     recruiter summary + a seriousness verdict.
 * The deterministic layer is authoritative for "obvious spam" so the AI can
 * never wave through a junk application.
 */
import { APPLICATION_QUESTIONS } from "@/lib/application-questions";

// Read OpenAI config straight from process.env (populated by Next / the systemd
// EnvironmentFile) so this module's pure check functions stay importable in unit
// tests without the full env schema (which requires DATABASE_URL).
const OPENAI_KEY = () => process.env.OPENAI_API_KEY;
const OPENAI_MODEL = () => process.env.OPENAI_MODEL || "gpt-4o-mini";

export type ScreenVerdict = "serious" | "review" | "spam";
export type ScreenResult = { verdict: ScreenVerdict; score: number; summary: string; flags: string[] };

// Free-text answers where genuine prose is expected (gibberish matters here).
const PROSE_KEYS = ["vaExperienceDesc", "adminExperienceDesc", "availability", "backupOption"];

export type Baseline = {
  flags: string[];
  resumeOk: boolean;
  gibberishFields: string[];
  lowEffort: boolean;
  hardFail: boolean; // looks like junk/spam regardless of AI
};

export function looksLikeGibberish(textRaw: string): boolean {
  const text = (textRaw || "").trim().toLowerCase();
  if (!text) return true;
  const compact = text.replace(/\s/g, "");
  if (compact.length < 2) return true;
  if (/^(.)\1{3,}$/.test(compact)) return true; // "aaaaa"
  const letters = text.replace(/[^a-z]/g, "");
  if (letters.length >= 5) {
    const vowels = (letters.match(/[aeiou]/g) || []).length;
    if (vowels / letters.length < 0.12) return true; // consonant mash
  }
  if (/(asdf|sdfg|qwer|wert|zxcv|hjkl|jkl;|asdasd)/.test(text)) return true; // keyboard rows
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= 3 && new Set(words).size === 1) return true; // "test test test"
  return false;
}

function isValidUrl(value: string): boolean {
  const v = (value || "").trim();
  return /^https?:\/\/[^\s.]+\.[^\s]+/i.test(v);
}

export function baselineChecks(answers: Record<string, string>): Baseline {
  const flags: string[] = [];
  const get = (k: string) => (answers[k] ?? "").trim();

  const resumeOk = isValidUrl(get("resumeUrl"));
  if (!resumeOk) flags.push("Resume link is missing or not a valid URL.");

  const gibberishFields: string[] = [];
  for (const k of PROSE_KEYS) {
    const v = get(k);
    if (v && looksLikeGibberish(v)) gibberishFields.push(labelFor(k));
  }
  if (gibberishFields.length) flags.push(`Answers look like gibberish: ${gibberishFields.join(", ")}.`);

  // Experience description (whichever branch applies) substance check.
  const expDesc = get("vaExperienceDesc") || get("adminExperienceDesc");
  const lowEffort = expDesc.length > 0 && expDesc.length < 15;
  if (lowEffort) flags.push("Experience answer is very short / low-effort.");

  // Count how many of the prose answers are empty-or-junk.
  const proseAnswered = PROSE_KEYS.map(get);
  const badProse = proseAnswered.filter((v) => !v || looksLikeGibberish(v)).length;
  const hardFail = (gibberishFields.length >= 2) || (badProse >= 3) || (!expDesc && gibberishFields.length >= 1);

  return { flags, resumeOk, gibberishFields, lowEffort, hardFail };
}

/** Run the full screen: deterministic baseline + (optional) OpenAI summary. */
export async function screenApplication(answers: Record<string, string>): Promise<ScreenResult> {
  const base = baselineChecks(answers);
  const ai = OPENAI_KEY() ? await aiScreen(answers).catch(() => null) : null;

  if (!ai) {
    // Deterministic-only verdict.
    const verdict: ScreenVerdict = base.hardFail ? "spam" : base.flags.length ? "review" : "serious";
    const score = base.hardFail ? 10 : base.flags.length ? 55 : 80;
    const summary = base.hardFail
      ? "Automated checks flagged this as likely junk — the open-ended answers are empty or nonsensical. Recommend a quick manual glance before rejecting."
      : base.flags.length
        ? `Automated checks only (AI summary unavailable). Concerns: ${base.flags.join(" ")}`
        : "Automated checks passed: required fields are filled and the answers look like genuine text. (AI summary unavailable.)";
    return { verdict, score, summary, flags: base.flags };
  }

  // Merge AI with the deterministic safety net.
  let verdict = ai.verdict;
  if (base.hardFail) verdict = "spam";
  else if (verdict === "serious" && base.flags.length) verdict = "review"; // don't wave through with open concerns
  let score = clampScore(ai.score);
  if (base.hardFail) score = Math.min(score, 15);
  else if (base.lowEffort) score = Math.min(score, 60);

  const flags = dedupe([...ai.concerns, ...base.flags]);
  return { verdict, score, summary: ai.summary.trim(), flags };
}

type AiOut = { verdict: ScreenVerdict; score: number; summary: string; concerns: string[] };

async function aiScreen(answers: Record<string, string>): Promise<AiOut | null> {
  const qa = APPLICATION_QUESTIONS
    .filter((q) => (answers[q.key] ?? "").trim())
    .map((q) => `${q.label}\n  → ${(answers[q.key] ?? "").trim()}`)
    .join("\n");

  const system = `You screen job applications for a Virtual Assistant agency (Pure Water Automations). Decide whether the applicant is a SERIOUS candidate who gave REAL, genuine answers — not spam, gibberish, or copy-paste filler. Be fair: non-native English, brevity, or modest experience are NOT disqualifying. Flag only genuine concerns: nonsensical/gibberish answers, blank or contradictory responses, an obviously fake or missing resume link, or answers that don't address the question.
Return ONLY JSON with this exact shape:
{"verdict":"serious|review|spam","score":0-100,"summary":"2-3 sentence summary FOR THE RECRUITER — who they are, relevant experience/skills, readiness (equipment/internet/timezone), and any concern","realAnswers":true|false,"concerns":["short concern", "..."]}
verdict: "serious" = clearly real and worth reviewing; "review" = real but with notable gaps/concerns; "spam" = gibberish, empty, or fake. score reflects overall seriousness + answer quality. Keep summary tight and useful.`;

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
        { role: "user", content: `Application answers:\n\n${qa.slice(0, 4000)}` },
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
  const verdict = ["serious", "review", "spam"].includes(String(parsed.verdict)) ? (parsed.verdict as ScreenVerdict) : "review";
  const summary = typeof parsed.summary === "string" ? parsed.summary : "No summary produced.";
  const concerns = Array.isArray(parsed.concerns) ? parsed.concerns.map(String).filter(Boolean).slice(0, 8) : [];
  return { verdict, score: clampScore(Number(parsed.score)), summary, concerns };
}

function labelFor(key: string): string {
  return APPLICATION_QUESTIONS.find((q) => q.key === key)?.label ?? key;
}
function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}
function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
}
