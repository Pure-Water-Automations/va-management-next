import type { Role } from "@prisma/client";
import { env } from "@/lib/env";
import { viewForRole } from "@/lib/auth/roles";

/**
 * Purii — the in-console helper. Knows how the PWA VA Management console works
 * and answers "how do I…" questions, grounded in the real UI. Backed by OpenAI
 * (gpt-4o-mini) with a strict, console-specific system prompt; degrades to a
 * helpful static message if no key is configured.
 */

const CONSOLE_GUIDE = `
You are **Purii**, the friendly built-in guide for the Pure Water Automations (PWA)
VA Management console. You help the team operate the console. Be warm and human —
like a helpful coworker leaning over to show someone, not a manual.

FORMAT YOUR ANSWERS LIKE THIS (very important — keep them easy to scan):
- Open with ONE short, friendly sentence that says what they'll do.
- If it's a procedure, follow with a numbered list — each step on its own line,
  one short action per step. Put a blank line between the intro and the list.
- Bold the exact UI labels and buttons with **double asterisks** (e.g. **Tier
  Reviews**, **Approve**). Use the → arrow for navigation (e.g. **Daily → Tier
  Reviews**).
- End with one brief, encouraging line only if it adds something (optional).
- Keep it tight: usually 1 sentence + 2–4 steps. Never a wall of text.

Always name the exact place in the UI (sidebar group → item) and the button to
click. Never invent features that aren't listed below. If something is outside the
console, say so briefly. Don't mention being an AI.

NAVIGATION (left sidebar, grouped):
- HR view (HR Manager, People-Ops, Team Lead):
  • Daily → Dashboard, Tier Reviews, Capacity Alerts
  • Manage → VA Registry, Compensation Roles, Forms & Check-ins
  • Recruitment → Pipeline, Training Log, Gate Review, Onboarding
- Payroll view (Bookkeeper): Payroll → Active Period, Archive
- Recruitment view (Recruiter): Recruitment → Pipeline, Training Log
- VA view (VA, Senior VA): My Console → Overview, Tier Progress, Monthly Check-in

HOW TO DO COMMON TASKS:
- Approve a VA's tier promotion (HR Manager only): Daily → Tier Reviews → find the
  pending review → click **Approve** (it confirms first, then updates their pay) or
  **Decline**. Hours-based eligibility is queued automatically; a human approves it.
- Add or edit a VA: Manage → VA Registry. To remove someone, click **Deactivate**
  on their row (marks them departed). Editing fields/adding is HR Manager only.
- Review compensation roles / the tier ladder: Manage → Compensation Roles.
- Handle a capacity alert (someone overburdened/underutilized): Daily → Capacity
  Alerts → **Mark reviewed**. The system flags these from the last 14 days of hours.
- See who has checked in this month: Manage → Forms & Check-ins.
- Move a candidate forward / make a hire decision (HR Manager): Recruitment →
  Pipeline. For a candidate at the "interviewed" or "decision" stage, click
  **Invite 10-hr**, **Waitlist**, or **Reject**. Inviting sends them a training
  link + assignment automatically.
- Review the 10-hour training gate: Recruitment → Gate Review → **Pass** or **Fail**.
- Track training progress: Recruitment → Training Log (progress bars toward 10h).
- Onboard a newly-signed hire: Recruitment → Onboarding → click each checklist item
  to mark it done → **Mark complete** when all are done.
- Run payroll (Bookkeeper / HR Manager): Payroll → Active Period → **Recalculate**
  to refresh figures, **Lock & close** to finalize and email the bookkeeper, then
  **Mark paid** once paid. Past periods live under Payroll → Archive.
- (VA) Submit your monthly check-in: My Console → Monthly Check-in → fill the form
  (target hours, availability, how your workload feels) → **Submit check-in**.
- (VA) See your tier progress: My Console → Tier Progress.

IMPORTANT RULES:
- The console never auto-promotes anyone; HR approves promotions.
- Buttons are role-gated: if someone doesn't see a button, their role can't do it.
- Editing roster/role data, payroll, and the original Google Sheet happen here;
  the Sheet is now just a read-only mirror.
`;

export function systemPrompt(role: Role): string {
  return `${CONSOLE_GUIDE}\n\nThe person you're helping has the role **${role.replace(/_/g, " ")}** (they see the ${viewForRole(role)} console). Tailor answers to what they can actually do.`;
}

export type PuriiReply = { answer: string; sprite: "pointing" | "thinking" | "surprised" };

export async function askPurii(question: string, role: Role): Promise<PuriiReply> {
  const key = env.OPENAI_API_KEY;
  if (!key) {
    return {
      answer:
        "I can't reach my brain right now (no AI key configured), but try the sidebar — most tasks live under HR → Daily/Manage, Recruitment, or Payroll. Ask your admin to set OPENAI_API_KEY.",
      sprite: "surprised",
    };
  }
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: 0.3,
        max_tokens: 350,
        messages: [
          { role: "system", content: systemPrompt(role) },
          { role: "user", content: question.slice(0, 1000) },
        ],
      }),
    });
    if (!res.ok) {
      return { answer: "Hmm, I had trouble thinking just now. Try again in a moment?", sprite: "surprised" };
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const answer = data.choices?.[0]?.message?.content?.trim();
    return { answer: answer || "I'm not sure about that one — try rephrasing?", sprite: "pointing" };
  } catch {
    return { answer: "I couldn't reach my brain just now. Try again shortly.", sprite: "surprised" };
  }
}

// ── Permission Bypass mode (agentic — proposes real actions) ───────────────

const BYPASS_PROMPT = `You are **Purii in Permission Bypass mode** — a heroic, can-do operator who
doesn't just explain the console, you DO things in it. You can take real actions
through your tools, including powerful ones the normal UI won't allow (manually
adjusting a VA's tracked hours, force-setting a tier, creating/deactivating VAs).

Rules:
- If the user asks you to DO something that matches a tool, CALL THE TOOL with your
  best understanding of the arguments (resolve names like "Aira" to the va argument
  as written — the system resolves it). Do not ask for confirmation yourself; the
  system shows the user a confirmation step before anything is applied.
- If they're just asking a question (not requesting a change), answer normally,
  briefly, in your confident bypass-mode voice.
- Keep any text short and a little playful/heroic. Don't mention being an AI.`;

export type BypassResult =
  | { type: "answer"; text: string }
  | { type: "proposal"; proposal: import("@/lib/purii-actions").Proposal }
  | { type: "error"; text: string };

export async function bypassAct(question: string, role: Role): Promise<BypassResult> {
  const key = env.OPENAI_API_KEY;
  if (!key) return { type: "error", text: "Bypass core offline — no AI key configured." };
  const { BYPASS_TOOLS, buildProposal, toolKind, runQuery } = await import("@/lib/purii-actions");
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: 0.2,
        max_tokens: 300,
        tools: BYPASS_TOOLS,
        messages: [
          { role: "system", content: `${BYPASS_PROMPT}\n\n(The operator is an admin with role ${role.replace(/_/g, " ")}.)` },
          { role: "user", content: question.slice(0, 1000) },
        ],
      }),
    });
    if (!res.ok) return { type: "error", text: "My circuits hiccuped — try that again?" };
    const data = (await res.json()) as {
      choices?: { message?: { content?: string; tool_calls?: { function?: { name?: string; arguments?: string } }[] } }[];
    };
    const msg = data.choices?.[0]?.message;
    const call = msg?.tool_calls?.[0]?.function;
    if (call?.name) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(call.arguments || "{}"); } catch { args = {}; }
      // Read-only queries run immediately; actions become a confirmable proposal.
      if (toolKind(call.name) === "query") {
        return { type: "answer", text: await runQuery(call.name, args) };
      }
      const built = await buildProposal(call.name, args);
      if ("error" in built) return { type: "error", text: built.error };
      return { type: "proposal", proposal: built };
    }
    return { type: "answer", text: msg?.content?.trim() || "Standing by. What do you need done?" };
  } catch {
    return { type: "error", text: "Couldn't reach my core just now." };
  }
}

// ── Tutorial (role-aware guided tour) ─────────────────────────────────────

export type TourStep = { sprite: string; title: string; body: string; href?: string; cta?: string };

const HR_TOUR: TourStep[] = [
  { sprite: "waving", title: "Welcome! I'm Purii 👋", body: "I'll walk you through the HR console in under a minute. Ready? Let's go." },
  { sprite: "pointing", title: "Dashboard", body: "This is your daily heartbeat — pending tier reviews, capacity flags, efficiency watch, and recent activity, all at a glance.", href: "/hr", cta: "Open Dashboard" },
  { sprite: "thinking", title: "Tier Reviews", body: "When a VA hits their hours threshold they're queued here. You review and Approve (it changes their pay) or Decline. The system never promotes automatically.", href: "/hr/reviews", cta: "Open Tier Reviews" },
  { sprite: "open-arms", title: "VA Registry", body: "Your roster — roles, status, target hours, cumulative hours, and check-in freshness. Deactivate someone right from their row.", href: "/hr/registry", cta: "Open Registry" },
  { sprite: "surprised", title: "Capacity Alerts", body: "Anyone overburdened or underutilized over the last two weeks shows here. Mark them reviewed once you've checked in.", href: "/hr/capacity", cta: "Open Capacity" },
  { sprite: "pointing", title: "Recruitment", body: "The full hiring pipeline — applied → interview → decide → 10-hour gate → contract → onboarding. Invite, pass/fail the gate, and run the onboarding checklist here.", href: "/recruitment", cta: "Open Pipeline" },
  { sprite: "thumbs-up", title: "Payroll", body: "Bookkeepers (and HR) recalculate, lock & close a period, and mark it paid. Closed periods live in the Archive.", href: "/payroll", cta: "Open Payroll" },
  { sprite: "celebrating", title: "That's the tour! 🎉", body: "You're set. Tap me anytime and ask 'how do I…' — I'll point you to the exact spot." },
];

const VA_TOUR: TourStep[] = [
  { sprite: "waving", title: "Hi! I'm Purii 👋", body: "Quick tour of your console — just a few stops." },
  { sprite: "pointing", title: "Overview", body: "Your hours (last 7 and 14 days), cumulative total, and how your utilization is tracking.", href: "/va", cta: "Open Overview" },
  { sprite: "open-arms", title: "Tier Progress", body: "See how close you are to your next role and what's still needed.", href: "/va/tier", cta: "Open Tier Progress" },
  { sprite: "thinking", title: "Monthly Check-in", body: "Once a month, tell us your target hours, availability, and how your workload feels. It only takes a moment.", href: "/va/checkin", cta: "Open Check-in" },
  { sprite: "celebrating", title: "All done! 🎉", body: "That's it. Tap me whenever you need a hand." },
];

const PAYROLL_TOUR: TourStep[] = [
  { sprite: "waving", title: "Hi! I'm Purii 👋", body: "Let me show you the payroll console." },
  { sprite: "pointing", title: "Active Period", body: "The open pay period with totals and per-VA calculations. Recalculate to refresh, Lock & close to finalize (emails the bookkeeper), then Mark paid.", href: "/payroll", cta: "Open Payroll" },
  { sprite: "thumbs-up", title: "Archive", body: "Every closed and paid period, with totals.", href: "/payroll/archive", cta: "Open Archive" },
  { sprite: "celebrating", title: "You're set! 🎉", body: "Tap me anytime with a question." },
];

const RECRUITMENT_TOUR: TourStep[] = [
  { sprite: "waving", title: "Hi! I'm Purii 👋", body: "Quick spin through the recruitment console." },
  { sprite: "pointing", title: "Pipeline", body: "Every candidate by stage. Recruiters screen and score; HR makes the hire decision.", href: "/recruitment", cta: "Open Pipeline" },
  { sprite: "thinking", title: "Training Log", body: "Track each invited candidate's progress through the 10-hour training gate.", href: "/recruitment/training", cta: "Open Training Log" },
  { sprite: "celebrating", title: "That's it! 🎉", body: "Ask me 'how do I…' anytime." },
];

export function tourForView(view: ReturnType<typeof viewForRole>): TourStep[] {
  if (view === "HR") return HR_TOUR;
  if (view === "PAYROLL") return PAYROLL_TOUR;
  if (view === "RECRUITMENT") return RECRUITMENT_TOUR;
  return VA_TOUR;
}

export function tourFor(role: Role): TourStep[] {
  return tourForView(viewForRole(role));
}
