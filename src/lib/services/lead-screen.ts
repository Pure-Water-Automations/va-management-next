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

const ORD: Record<LeadVerdict, number> = { cold: 0, warm: 1, hot: 2 };
const VERDICT_BY_ORD: LeadVerdict[] = ["cold", "warm", "hot"];

/** Keep the score inside its verdict's band so the chip and the number agree. */
function clampToBand(verdict: LeadVerdict, score: number): number {
  if (verdict === "cold") return Math.min(score, 40);
  if (verdict === "warm") return Math.max(41, Math.min(score, 69));
  return Math.max(70, score); // hot
}

/**
 * Conservative blend of the AI read and the deterministic baseline. The AI adds
 * the human-readable summary and can be MORE skeptical, but never makes a lead
 * look stronger than the deterministic BANT/fit signals justify: the final
 * verdict is the lower (more conservative) of the two, and the score is clamped
 * into that verdict's band.
 */
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
  const verdict = VERDICT_BY_ORD[Math.min(ORD[base.verdict], ORD[ai.verdict])];
  const score = clampToBand(verdict, clampScore(ai.score));
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
