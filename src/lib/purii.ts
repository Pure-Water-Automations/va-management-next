import type { Role } from "@prisma/client";
import { env } from "@/lib/env";
import { viewForRole } from "@/lib/auth/roles";

/**
 * Purii — the in-console helper. Knows how the PWA VA Management console works
 * and answers "how do I…" questions, grounded in the real UI. Backed by OpenAI
 * (gpt-4o-mini) with a strict, console-specific system prompt; degrades to a
 * helpful static message if no key is configured.
 */

const APPLY_URL = `${(env.APP_BASE_URL ?? "https://dev-team.pwasecondbrain.uk").replace(/\/+$/, "")}/apply`;

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
  • Daily → Dashboard, Tier Reviews, Evaluations, Capacity Alerts
  • Manage → VA Registry, Compensation Roles, Forms & Check-ins, Contract template, Client agreement, Email sender
  • Projects → Projects, All Tasks, Available, Workload, Templates
  • Recruitment → Pipeline, Training Log, Gate Review, Training Module, Onboarding
  • Clients (HR Manager / People-Ops / admins) → Sales Pipeline, Onboarding, Organizations, Client Requests
  • Meetings → Meeting Actions (only for task reviewers: HR Manager, Team Lead, Senior VA)
  • Admin (admins only) → Users
  • Recordings (admins and the founder) → Record, Recordings
- Payroll view (Bookkeeper): Payroll → Active Period, Archive
- Recruitment view (Recruiter): Recruitment → Pipeline, Training Log
- VA view (VA, Senior VA) — a top nav, not a sidebar: Overview, My Tasks, Available, Tier, Evaluation, Check-in.
  Senior VAs (and any VA allowed to delegate) also get All Tasks and Projects; task reviewers also get Meetings.

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
- Create a project (HR Manager / Team Lead): Projects → Projects → **+ New Project**
  (name, description, client, owner, priority, due date). Open a project to see its
  tasks, progress, and activity.
- Create / assign a task: open a project and use **+ Add task** for a quick one, or
  Projects → **All Tasks** → **+ Delegate Task** for the full form. Pick the assignee from the
  dropdown — VAs are listed **least-busy first** with their open-task count, so you can
  spread load. A new task emails the assignee automatically.
- Post a task to the open pool instead of assigning it: mark it **claimable** when you
  create it. It then shows under Projects → **Available**, where any VA can claim it and a
  manager approves the claim.
- Different task views: Projects → **All Tasks** has a List, plus **Board** (by status),
  **Calendar** (by due date), and **Gantt** (timeline) — switch with the view tabs.
- Reassign a task (managers): open the task (Projects → All Tasks → the task, or from a
  project) → use the **Assigned to** dropdown to pick a different VA. The new assignee
  is notified.
- Reassign a project / change its owner: Projects → open the project → **Edit** → change
  the **Owner**.
- Update a task's status: open the task → the status dropdown (or the **Board** /
  **Workload** views). Senior VAs and the assignee can update their own tasks.
- See team workload: Projects → **Workload** — open tasks per VA.
- (VA) See your tasks: **My Tasks**. Update status as you work. **Available** shows the
  open pool you can claim. A Tier-1+ VA can also add a task onto a project they're on.
- Find or share the public VA **application form**: it lives at **${APPLY_URL}** and is
  linked on **Manage → Forms & Check-ins**. Send it to prospective VAs; their submissions
  show up in **Recruitment → Pipeline** as **Applied** (with an automatic AI first-pass screen).
- Move a candidate forward / make a hire decision (HR Manager): Recruitment →
  Pipeline. For a candidate at the "interviewed" or "decision" stage, click
  **Recommend 10-hr**, **Waitlist**, or **Reject**. Recommending starts the
  10-hr trial flow (training link + assignment).
- Review the 10-hour training gate: Recruitment → Gate Review → **Pass** or **Fail**.
- Track training progress: Recruitment → Training Log (progress bars toward 10h).
- Edit the 10-hour trial tasks: Recruitment → Training Module.
- Onboard a newly-signed hire: Recruitment → Onboarding → click each checklist item
  to mark it done → **Mark complete** when all are done.
- Run payroll (Bookkeeper / HR Manager): Payroll → Active Period → **Recalculate**
  to refresh figures, **Lock & close** to finalize and email the bookkeeper, then
  **Mark paid** once paid. Past periods live under Payroll → Archive.
- (VA) Submit your check-in: **Check-in** → fill the form (target hours, availability,
  how your workload feels) → **Submit check-in**.
- (VA) See your tier progress: **Tier**.

CLIENTS & CLIENT REQUESTS (HR Manager / People-Ops / admins, under the Clients group):
- Client organizations: Clients → **Organizations** → open one to see its projects, tasks,
  members, and Notion sync. Each client org has its own portal.
- Client requests: Clients → **Client Requests** — requests clients submit from their
  portal. Triage them, then assigning one creates a real task for a VA. You can also decline.
- New-client setup: Clients → **Sales Pipeline** (deals) and Clients → **Onboarding**
  (the new-client checklist; marking it complete activates the org and its portal).

MEETING ACTIONS (Meetings → Meeting Actions; HR Manager / Team Lead / Senior VA):
- Action items are pulled automatically from Zoom meeting transcripts. Review each one:
  click **Add** (the ✓) to turn it into a real assigned task, or **Skip** to dismiss it.

RECORDINGS (admins and the founder, Recordings group):
- Recordings → **Record** captures screen + mic; **Recordings** is the library. A recording
  can be shared to a client's portal. **Enhance** auto-tightens a recording (beta — founder only).

NOTION SYNC (beta):
- A client who runs their projects/tasks in their own Notion can connect it. Staff: open the
  client at Clients → **Organizations** → the **Notion sync** section (founder only for now).
  Clients connect it themselves in their portal under **Settings**. Status then syncs both ways
  and each linked item shows a link to its Notion page.

ADMIN (admins only): Admin → **Users** — add a user, set their role, activate/deactivate them.

IMPORTANT RULES:
- The console never auto-promotes anyone; HR approves promotions.
- Buttons are role-gated: if someone doesn't see a button, their role can't do it.
- Some features are beta and only the founder sees them (Enhance, Discover, the staff-side
  Notion connect); Recordings are visible to admins and the founder.
- PostgreSQL is the source of truth; the Google Sheet is now just a read-only mirror.
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
through your tools, including powerful ones the normal UI won't allow.

Your tools cover the whole console:
- People: adjust a VA's tracked hours, force-set a tier, set target hours/supervisor,
  create/update/deactivate/reactivate VAs, approve or decline tier reviews, resolve a
  capacity flag, email VAs.
- Work: create / reassign / delete a task and change its status; list tasks and projects.
- Payroll: recalculate, create, close, and mark a period paid; set a role's pay rate.
- Recruitment & onboarding: move a candidate through the pipeline, invite to the 10-hr
  trial, record a hire decision or gate result, mark a contract signed, check off
  onboarding items, add a training assignment.
- Ops & insight: run a background worker now, toggle the daily nudges, and read live
  stats (who's overburdened, a VA's hours, payroll/pipeline summaries, missing check-ins,
  top hours).

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
  { sprite: "waving", title: "Welcome! I'm Purii 👋", body: "I'll walk you through your whole HR console — every tab in the sidebar. Tap Next to step through, or skip anytime." },
  // Daily
  { sprite: "pointing", title: "Dashboard", body: "Your daily heartbeat — pending tier reviews, capacity flags, efficiency watch, and recent activity, all at a glance.", href: "/hr", cta: "Open Dashboard" },
  { sprite: "thinking", title: "Tier Reviews", body: "When a VA hits their hours threshold they're queued here. Approve (it changes their pay) or Decline — the system never promotes automatically.", href: "/hr/reviews", cta: "Open Tier Reviews" },
  { sprite: "thumbs-up", title: "Evaluations", body: "Start and review performance evaluations for your VAs — they feed tier progression and trainee graduation.", href: "/hr/evaluations", cta: "Open Evaluations" },
  { sprite: "surprised", title: "Capacity Alerts", body: "Anyone over- or under-utilized over the last two weeks shows here. Mark them reviewed once you've checked in.", href: "/hr/capacity", cta: "Open Capacity" },
  // Manage
  { sprite: "open-arms", title: "VA Registry", body: "Your roster — roles, status, target hours, cumulative hours, and check-in freshness. Deactivate someone right from their row.", href: "/hr/registry", cta: "Open Registry" },
  { sprite: "pointing", title: "Compensation Roles", body: "The tier ladder — each role's hourly rate and the hours threshold to reach it. This is what tier reviews promote toward.", href: "/hr/roles", cta: "Open Comp Roles" },
  { sprite: "thinking", title: "Forms & Check-ins", body: "Your VAs' monthly check-in responses, plus the form/application links you share with them.", href: "/hr/checkins", cta: "Open Forms & Check-ins" },
  { sprite: "thumbs-up", title: "Contract template", body: "The agreement candidates e-sign. Edit the template here — changes apply to the next contract you send.", href: "/admin/contract", cta: "Open Contract template" },
  { sprite: "thinking", title: "Email sender", body: "Connect the Gmail account that sends contracts, invites, and alerts — and control the test-mode redirect while the team trials the app.", href: "/admin/email", cta: "Open Email sender" },
  // Projects & Tasks
  { sprite: "open-arms", title: "Projects", body: "Group related work into projects — each with tasks, progress, an owner, and an activity feed. Create one with **+ New Project**, then open it to manage its tasks.", href: "/hr/projects", cta: "Open Projects" },
  { sprite: "pointing", title: "Tasks & Delegation", body: "Delegate work to your VAs here — the assignee picker lists who's **least busy first** (with their open-task count). Track everything under All Tasks, reassign from a task, and balance load on Workload.", href: "/hr/tasks", cta: "Open Tasks" },
  // Recruitment
  { sprite: "pointing", title: "Recruitment — Pipeline", body: "Every candidate by stage — from applied and interviewed, through the hiring decision, the pre-trial review, the 10-hour trial and gate, to contract, signing and onboarding.", href: "/recruitment", cta: "Open Pipeline" },
  { sprite: "thinking", title: "Training Log", body: "Each invited candidate's progress through the 10-hour skills trial — hours logged and tasks completed.", href: "/recruitment/training", cta: "Open Training Log" },
  { sprite: "surprised", title: "Gate Reviews", body: "Two review points: the pre-trial check (approve to start the trial) and the 10-hour gate (pass to send a contract).", href: "/recruitment/gate", cta: "Open Gate Reviews" },
  { sprite: "open-arms", title: "Training Module", body: "The editable 10-hour training module every candidate works through — readings, videos, a quiz, hands-on tasks, and submission. Add, edit, or reorder items here.", href: "/recruitment/tasks", cta: "Open Training Module" },
  { sprite: "thumbs-up", title: "Onboarding", body: "Once a contract is signed, run the new VA's onboarding checklist to completion here.", href: "/recruitment/onboarding", cta: "Open Onboarding" },
  { sprite: "celebrating", title: "That's the full tour! 🎉", body: "You've seen every tab. Tap me anytime and ask 'how do I…' — I'll point you to the exact spot." },
];

const VA_TOUR: TourStep[] = [
  { sprite: "waving", title: "Hi! I'm Purii 👋", body: "Quick tour of your console — just a few stops." },
  { sprite: "pointing", title: "Overview", body: "Your hours (last 7 and 14 days), cumulative total, and how your utilization is tracking.", href: "/va", cta: "Open Overview" },
  { sprite: "open-arms", title: "Tier Progress", body: "See how close you are to your next role and what's still needed.", href: "/va/tier", cta: "Open Tier Progress" },
  { sprite: "thumbs-up", title: "Evaluation", body: "Complete your performance self-assessment and review your supervisor's feedback — your rating feeds promotion decisions.", href: "/va/evaluation", cta: "Open Evaluation" },
  { sprite: "thinking", title: "Monthly Check-in", body: "Once a month, tell us your target hours, availability, and how your workload feels. It only takes a moment.", href: "/va/checkin", cta: "Open Check-in" },
  { sprite: "pointing", title: "My Tasks", body: "Your assigned tasks live here. Open one to read the details and update its status as you work through it.", href: "/va/tasks", cta: "Open My Tasks" },
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

const SALES_TOUR: TourStep[] = [
  { sprite: "waving", title: "Hi! I'm Purii 👋", body: "Quick spin through the sales console." },
  { sprite: "pointing", title: "Pipeline", body: "Every deal by stage. New leads arrive auto-scored from the public discover form — book the discovery call, save call notes, and send the agreement.", href: "/sales", cta: "Open Pipeline" },
  { sprite: "celebrating", title: "That's it! 🎉", body: "Ask me 'how do I…' anytime." },
];

const ADMIN_TOUR: TourStep[] = [
  { sprite: "waving", title: "Hi! I'm Purii 👋", body: "This is the Admin console — everything admin-only lives here. Use the top bar's View as to hop into HR, Payroll, Recruitment, Sales, or the VA console." },
  { sprite: "pointing", title: "Settings", body: "Contract template, Client agreement, Email sender, WhatsApp, and Zoom — the app's connections and templates.", href: "/admin/users", cta: "Open Admin" },
  { sprite: "thinking", title: "Users", body: "Add a teammate, set their role, and toggle admin/active. Roles are job functions; VA seniority is driven by tier, not role.", href: "/admin/users", cta: "Open Users" },
  { sprite: "celebrating", title: "That's it! 🎉", body: "Switch views up top to work in any console. Ask me 'how do I…' anytime." },
];

export function tourForView(view: ReturnType<typeof viewForRole>): TourStep[] {
  if (view === "ADMIN") return ADMIN_TOUR;
  if (view === "HR") return HR_TOUR;
  if (view === "PAYROLL") return PAYROLL_TOUR;
  if (view === "RECRUITMENT") return RECRUITMENT_TOUR;
  if (view === "SALES") return SALES_TOUR;
  return VA_TOUR;
}

export function tourFor(role: Role): TourStep[] {
  return tourForView(viewForRole(role));
}
