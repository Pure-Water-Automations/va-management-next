import { spawn } from "node:child_process";
import type { CompRole } from "@prisma/client";
import { db } from "@/lib/db";
import { logActivity, audit } from "@/lib/activity";
import { sendSystemEmail } from "@/lib/email";
import { loadSettings, str } from "@/lib/settings";
import * as hr from "@/lib/actions/hr";
import * as payroll from "@/lib/actions/payroll";
import * as rec from "@/lib/actions/recruitment";
import * as onb from "@/lib/actions/onboarding";
import { getCapacity, getCheckins } from "@/lib/reads/hr-extra";
import { getVaDashboard } from "@/lib/reads/va";
import { getPayrollDashboard } from "@/lib/reads/payroll";
import { getPipeline } from "@/lib/reads/recruitment";
import * as tasksActions from "@/lib/actions/tasks";
import { executeTool as mcpTaskTool } from "@/lib/mcp/tools";
import type { McpActor } from "@/lib/mcp/access";
import { canUserDelegateTasks } from "@/lib/auth/delegation";
import type { Role, TaskStatus as TaskStatusT } from "@prisma/client";

/**
 * Purii "Permission Bypass" tool registry. Two kinds of tools:
 *  - action: proposes a change (buildProposal) that the user must confirm, then
 *    runs it (executeAction). Admin-only, every run audited as a bypass action.
 *  - query: read-only, runs immediately (runQuery) and returns an answer.
 */

const COMP_ROLES = ["TRAINEE", "TIER_1", "TIER_2", "TIER_3", "TIER_4"];
const OPEN_REVIEW = ["hours_triggered", "form_sent", "under_review"];
const STAGES = [
  "applied", "reviewed", "interview_scheduled", "interviewed", "decision",
  "tenhr_invited", "tenhr_in_progress", "tenhr_pass", "tenhr_fail",
  "contract_sent", "signed", "onboarding", "closed",
];
const WORKERS = ["sheet-mirror-export", "tier-check", "capacity-monitor", "payroll-close", "monthly-checkin", "desklog-ingest", "nudge", "application-intake-poll", "application-screen", "transcript-to-tasks", "recordings-process", "sales-followup", "notion-sync"];

export type Proposal = { tool: string; args: Record<string, unknown>; summary: string };
type Built = Proposal | { error: string };

// ── Task/Project helpers (shared by the create/update/reassign/delete tools) ──
const READONLY_CTX: McpActor = { actorId: "", actorEmail: "", actorName: null, actorRole: "HR_MANAGER" as Role, isAdmin: false, canDelegate: false, vaId: null };
async function taskActorCtx(actorEmail: string): Promise<McpActor> {
  const u = await db.user.findUnique({
    where: { email: actorEmail.toLowerCase() },
    select: { id: true, email: true, name: true, role: true, isAdmin: true, vaId: true },
  });
  if (!u) throw new Error("I couldn't resolve your account.");
  return {
    actorId: u.id,
    actorEmail: u.email,
    actorName: u.name,
    actorRole: u.role,
    isAdmin: u.isAdmin,
    canDelegate: await canUserDelegateTasks(u.id),
    vaId: u.vaId,
  };
}
async function resolveTaskRef(ref: string): Promise<{ id: string; title: string } | null> {
  const r = (ref || "").trim();
  if (!r) return null;
  const byId = await db.task.findUnique({ where: { id: r }, select: { id: true, title: true } });
  if (byId) return byId;
  return db.task.findFirst({ where: { title: { contains: r, mode: "insensitive" } }, orderBy: { createdAt: "desc" }, select: { id: true, title: true } });
}
async function resolveUserRef(ref: string): Promise<{ id: string; name: string | null; email: string } | null> {
  const r = (ref || "").trim();
  if (!r) return null;
  const byEmail = await db.user.findFirst({ where: { email: { equals: r, mode: "insensitive" } }, select: { id: true, name: true, email: true } });
  if (byEmail) return byEmail;
  return db.user.findFirst({ where: { name: { contains: r, mode: "insensitive" }, active: true }, select: { id: true, name: true, email: true } });
}
type Tool = {
  def: { type: "function"; function: { name: string; description: string; parameters: object } };
  kind: "action" | "query";
  build?: (a: Record<string, unknown>) => Promise<Built>;
  exec?: (a: Record<string, unknown>, actor: string) => Promise<string>;
  run?: (a: Record<string, unknown>) => Promise<string>;
};

// ── helpers ────────────────────────────────────────────────────────────────
function num(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) ? n : null; }
function s(v: unknown): string { return String(v ?? "").trim(); }

async function resolveVa(query: string): Promise<{ vaId: string; name: string } | null> {
  const q = s(query); if (!q) return null;
  const m = await db.va.findMany({
    where: { OR: [{ vaId: { equals: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] },
    select: { vaId: true, name: true }, take: 5,
  });
  if (!m.length) return null;
  const lo = q.toLowerCase();
  return m.find((x) => x.vaId.toLowerCase() === lo || x.name.toLowerCase() === lo)
    ?? m.find((x) => x.name.toLowerCase().startsWith(lo)) ?? m[0];
}
async function resolveCandidate(query: string): Promise<{ candidateId: string; name: string } | null> {
  const q = s(query); if (!q) return null;
  const m = await db.candidate.findMany({
    where: { OR: [{ candidateId: { equals: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] },
    select: { candidateId: true, name: true, email: true }, take: 5,
  });
  if (!m.length) return null;
  const lo = q.toLowerCase();
  const pick = m.find((x) => x.candidateId.toLowerCase() === lo || (x.name ?? "").toLowerCase() === lo) ?? m[0];
  return { candidateId: pick.candidateId, name: pick.name ?? pick.email };
}
async function openReview(vaId: string) {
  return db.tierReview.findFirst({ where: { vaId, status: { in: OPEN_REVIEW as never } }, orderBy: { timestamp: "asc" } });
}
async function vaArg(a: Record<string, unknown>, key = "va") {
  return resolveVa(s(a[key]));
}
const fn = (name: string, description: string, properties: object, required: string[]) =>
  ({ type: "function" as const, function: { name, description, parameters: { type: "object", properties, required } } });

async function makeVaId(name: string): Promise<string> {
  const p = name.trim().toLowerCase().split(/\s+/);
  const base = (p[0] || "va") + (p[1] ? "_" + p[1][0] : "");
  let id = base.replace(/[^a-z0-9_]/g, ""); let n = 1;
  while (await db.va.findUnique({ where: { vaId: id }, select: { vaId: true } })) id = `${base}${n++}`;
  return id;
}
async function logExec(actor: string, name: string, target: string | null, details: Record<string, unknown> = {}) {
  await audit({ actorEmail: actor, action: `bypass.${name}`, target, details: { bypass: true, ...details } });
}

// ── registry ─────────────────────────────────────────────────────────────
const TOOLS: Record<string, Tool> = {
  // ----- original 5 -----
  adjust_hours: {
    kind: "action",
    def: fn("adjust_hours", "Manually add (positive) or subtract (negative) tracked DeskLog hours for a VA — something the normal UI can't do.", { va: { type: "string" }, hours: { type: "number" }, reason: { type: "string" } }, ["va", "hours"]),
    build: async (a) => {
      const va = await vaArg(a); const h = num(a.hours);
      if (!va) return { error: `I couldn't find a VA matching "${a.va}".` };
      if (h === null || h === 0) return { error: "Tell me how many hours to adjust." };
      return { tool: "adjust_hours", args: { vaId: va.vaId, hours: h, reason: s(a.reason) }, summary: `${h > 0 ? "add" : "remove"} ${Math.abs(h)} tracked hour(s) ${h > 0 ? "to" : "from"} **${va.name}** (${va.vaId})${a.reason ? ` — ${a.reason}` : ""}` };
    },
    exec: async (a, actor) => {
      const vaId = s(a.vaId); const h = Number(a.hours);
      const va = await db.va.findUnique({ where: { vaId } }); if (!va) throw new Error("VA not found");
      await db.deskLogHours.create({ data: { date: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z"), vaId, taskSpentHrs: h, project: "Manual adjustment (Purii bypass)", task: s(a.reason), needsReview: true, reviewReason: "Manual hours adjustment via Purii", payRule: "manual" } });
      await logActivity({ source: "purii_bypass", eventType: "hours_adjusted", vaId, severity: "warning", summary: `${actor} adjusted ${va.name}'s hours by ${h} via Purii` });
      await logExec(actor, "adjust_hours", vaId, { hours: h });
      return `Done — adjusted **${va.name}**'s tracked hours by ${h}.`;
    },
  },
  create_va: {
    kind: "action",
    def: fn("create_va", "Create a new VA in the registry.", { name: { type: "string" }, email: { type: "string" }, role: { type: "string", enum: COMP_ROLES }, targetHoursWeekly: { type: "number" } }, ["name", "email"]),
    build: async (a) => {
      const name = s(a.name), email = s(a.email);
      if (!name || !email) return { error: "I need a name and email to create a VA." };
      const role = COMP_ROLES.includes(s(a.role)) ? s(a.role) : "TRAINEE";
      const t = num(a.targetHoursWeekly);
      return { tool: "create_va", args: { name, email, role, targetHoursWeekly: t }, summary: `create a new VA **${name}** (${email}) as **${role}**${t ? `, target ${t}h/wk` : ""}` };
    },
    exec: async (a, actor) => {
      const name = s(a.name), email = s(a.email), role = s(a.role) as CompRole;
      const vaId = await makeVaId(name);
      await db.va.create({ data: { vaId, name, email, compensationRole: role, status: role === "TRAINEE" ? "training" : "active", roleStartedDate: new Date(), targetHoursWeekly: a.targetHoursWeekly != null ? Number(a.targetHoursWeekly) : null } });
      await logActivity({ source: "purii_bypass", eventType: "va_created", vaId, summary: `${actor} created VA ${name} via Purii` });
      await logExec(actor, "create_va", vaId);
      return `Created **${name}** as **${role}** (${vaId}).`;
    },
  },
  set_role: {
    kind: "action",
    def: fn("set_role", "Directly set a VA's compensation role (force a tier without a review).", { va: { type: "string" }, role: { type: "string", enum: COMP_ROLES } }, ["va", "role"]),
    build: async (a) => {
      const va = await vaArg(a); const role = s(a.role).toUpperCase();
      if (!va) return { error: `I couldn't find a VA matching "${a.va}".` };
      if (!COMP_ROLES.includes(role)) return { error: `"${a.role}" isn't a valid role.` };
      return { tool: "set_role", args: { vaId: va.vaId, role }, summary: `set **${va.name}**'s role to **${role}** (skipping the normal review)` };
    },
    exec: async (a, actor) => {
      const vaId = s(a.vaId); const role = s(a.role) as CompRole;
      await db.va.update({ where: { vaId }, data: { compensationRole: role, roleStartedDate: new Date() } });
      await logActivity({ source: "purii_bypass", eventType: "role_set", vaId, severity: "warning", summary: `${actor} set ${vaId} role to ${role} via Purii` });
      await logExec(actor, "set_role", vaId, { role });
      return `Set role to **${role}**.`;
    },
  },
  set_target_hours: {
    kind: "action",
    def: fn("set_target_hours", "Set a VA's weekly target hours.", { va: { type: "string" }, hours: { type: "number" } }, ["va", "hours"]),
    build: async (a) => {
      const va = await vaArg(a); const h = num(a.hours);
      if (!va) return { error: `I couldn't find a VA matching "${a.va}".` };
      if (h === null) return { error: "Tell me the target hours." };
      return { tool: "set_target_hours", args: { vaId: va.vaId, hours: h }, summary: `set **${va.name}**'s weekly target to **${h}h**` };
    },
    exec: async (a, actor) => {
      const vaId = s(a.vaId); const h = Number(a.hours);
      await db.va.update({ where: { vaId }, data: { targetHoursWeekly: h } });
      await logActivity({ source: "purii_bypass", eventType: "target_set", vaId, summary: `${actor} set ${vaId} target to ${h}h via Purii` });
      await logExec(actor, "set_target_hours", vaId, { hours: h });
      return `Target set to **${h}h**.`;
    },
  },
  deactivate_va: {
    kind: "action",
    def: fn("deactivate_va", "Deactivate a VA (mark departed).", { va: { type: "string" }, reason: { type: "string" } }, ["va"]),
    build: async (a) => { const va = await vaArg(a); if (!va) return { error: `I couldn't find a VA matching "${a.va}".` }; return { tool: "deactivate_va", args: { vaId: va.vaId, reason: s(a.reason) }, summary: `deactivate **${va.name}** (${va.vaId}) — mark departed` }; },
    exec: async (a, actor) => { const vaId = s(a.vaId); await db.va.update({ where: { vaId }, data: { status: "departed", availabilityNotes: s(a.reason) } }); await logActivity({ source: "purii_bypass", eventType: "va_deactivated", vaId, severity: "warning", summary: `${actor} deactivated ${vaId} via Purii` }); await logExec(actor, "deactivate_va", vaId); return `Deactivated.`; },
  },
  // ----- new HR -----
  reactivate_va: {
    kind: "action",
    def: fn("reactivate_va", "Reactivate a departed VA (set active).", { va: { type: "string" } }, ["va"]),
    build: async (a) => { const va = await vaArg(a); if (!va) return { error: `I couldn't find a VA matching "${a.va}".` }; return { tool: "reactivate_va", args: { vaId: va.vaId }, summary: `reactivate **${va.name}** (${va.vaId})` }; },
    exec: async (a, actor) => { const vaId = s(a.vaId); await db.va.update({ where: { vaId }, data: { status: "active" } }); await logActivity({ source: "purii_bypass", eventType: "va_reactivated", vaId, summary: `${actor} reactivated ${vaId} via Purii` }); await logExec(actor, "reactivate_va", vaId); return `Reactivated.`; },
  },
  approve_tier: {
    kind: "action",
    def: fn("approve_tier", "Approve a VA's pending tier promotion.", { va: { type: "string" } }, ["va"]),
    build: async (a) => {
      const va = await vaArg(a); if (!va) return { error: `I couldn't find a VA matching "${a.va}".` };
      const review = await openReview(va.vaId); if (!review) return { error: `${va.name} has no pending tier review.` };
      if (!review.targetRole) return { error: `${va.name}'s review has no target role set.` };
      return { tool: "approve_tier", args: { reviewId: review.id, vaId: va.vaId, role: review.targetRole }, summary: `approve **${va.name}**'s promotion to **${review.targetRole}** (changes their pay)` };
    },
    exec: async (a, actor) => { await hr.approveTierReview(s(a.reviewId), s(a.vaId), s(a.role) as CompRole, actor); await logExec(actor, "approve_tier", s(a.vaId), { role: a.role }); return `Approved — promoted to **${a.role}**.`; },
  },
  decline_tier: {
    kind: "action",
    def: fn("decline_tier", "Decline a VA's pending tier review.", { va: { type: "string" }, reason: { type: "string" } }, ["va"]),
    build: async (a) => { const va = await vaArg(a); if (!va) return { error: `I couldn't find a VA matching "${a.va}".` }; const review = await openReview(va.vaId); if (!review) return { error: `${va.name} has no pending tier review.` }; return { tool: "decline_tier", args: { reviewId: review.id, reason: s(a.reason) }, summary: `decline **${va.name}**'s tier review${a.reason ? ` — ${a.reason}` : ""}` }; },
    exec: async (a, actor) => { await hr.declineTierReview(s(a.reviewId), s(a.reason), actor); await logExec(actor, "decline_tier", s(a.reviewId)); return `Declined.`; },
  },
  set_supervisor: {
    kind: "action",
    def: fn("set_supervisor", "Set a VA's supervisor.", { va: { type: "string" }, supervisor: { type: "string" } }, ["va", "supervisor"]),
    build: async (a) => { const va = await vaArg(a); const sup = await vaArg(a, "supervisor"); if (!va) return { error: `I couldn't find a VA matching "${a.va}".` }; if (!sup) return { error: `I couldn't find a supervisor matching "${a.supervisor}".` }; return { tool: "set_supervisor", args: { vaId: va.vaId, supervisorVaId: sup.vaId }, summary: `make **${sup.name}** the supervisor of **${va.name}**` }; },
    exec: async (a, actor) => { const vaId = s(a.vaId); await db.va.update({ where: { vaId }, data: { supervisorVaId: s(a.supervisorVaId) } }); await logActivity({ source: "purii_bypass", eventType: "supervisor_set", vaId, summary: `${actor} set ${vaId} supervisor via Purii` }); await logExec(actor, "set_supervisor", vaId); return `Supervisor updated.`; },
  },
  update_va: {
    kind: "action",
    def: fn("update_va", "Update a VA's email, name, or skills.", { va: { type: "string" }, email: { type: "string" }, name: { type: "string" }, skills: { type: "string" } }, ["va"]),
    build: async (a) => {
      const va = await vaArg(a); if (!va) return { error: `I couldn't find a VA matching "${a.va}".` };
      const fields: string[] = []; const data: Record<string, unknown> = {};
      if (s(a.email)) { data.email = s(a.email); fields.push(`email → ${a.email}`); }
      if (s(a.name)) { data.name = s(a.name); fields.push(`name → ${a.name}`); }
      if (s(a.skills)) { data.skillSpecs = s(a.skills); fields.push(`skills → ${a.skills}`); }
      if (!fields.length) return { error: "Tell me what to change (email, name, or skills)." };
      return { tool: "update_va", args: { vaId: va.vaId, data }, summary: `update **${va.name}**: ${fields.join(", ")}` };
    },
    exec: async (a, actor) => { const vaId = s(a.vaId); await db.va.update({ where: { vaId }, data: a.data as Record<string, unknown> }); await logActivity({ source: "purii_bypass", eventType: "va_updated", vaId, summary: `${actor} updated ${vaId} via Purii` }); await logExec(actor, "update_va", vaId); return `Updated.`; },
  },
  send_skill_form: {
    kind: "action",
    def: fn("send_skill_form", "Email a VA the skill attestation form for their pending review.", { va: { type: "string" } }, ["va"]),
    build: async (a) => { const va = await vaArg(a); if (!va) return { error: `I couldn't find a VA matching "${a.va}".` }; const review = await openReview(va.vaId); if (!review) return { error: `${va.name} has no pending tier review.` }; return { tool: "send_skill_form", args: { reviewId: review.id, vaId: va.vaId }, summary: `send the skill attestation form to **${va.name}**` }; },
    exec: async (a, actor) => { await hr.sendSkillAttestationForm(s(a.reviewId), s(a.vaId), actor); await logExec(actor, "send_skill_form", s(a.vaId)); return `Form sent.`; },
  },
  resolve_capacity: {
    kind: "action",
    def: fn("resolve_capacity", "Clear/resolve a VA's capacity flag.", { va: { type: "string" }, note: { type: "string" } }, ["va"]),
    build: async (a) => { const va = await vaArg(a); if (!va) return { error: `I couldn't find a VA matching "${a.va}".` }; return { tool: "resolve_capacity", args: { vaId: va.vaId, note: s(a.note) }, summary: `mark **${va.name}**'s capacity flag reviewed` }; },
    exec: async (a, actor) => { await hr.resolveCapacityFlag(s(a.vaId), s(a.note), actor); await logExec(actor, "resolve_capacity", s(a.vaId)); return `Capacity flag cleared.`; },
  },
  // ----- payroll -----
  recalc_payroll: {
    kind: "action",
    def: fn("recalc_payroll", "Recalculate the open payroll period.", {}, []),
    build: async () => ({ tool: "recalc_payroll", args: {}, summary: `recalculate the open payroll period` }),
    exec: async (_a, actor) => { await payroll.recalculateOpenPeriod(); await logExec(actor, "recalc_payroll", null); return `Payroll recalculated.`; },
  },
  close_period: {
    kind: "action",
    def: fn("close_period", "Lock and close the open payroll period (emails the bookkeeper).", {}, []),
    build: async () => ({ tool: "close_period", args: {}, summary: `lock & close the open payroll period — this finalizes it and emails the bookkeeper` }),
    exec: async (_a, actor) => { await payroll.lockOpenPeriod(); await logExec(actor, "close_period", null); return `Period closed.`; },
  },
  mark_period_paid: {
    kind: "action",
    def: fn("mark_period_paid", "Mark a payroll period paid.", { period: { type: "string", description: "YYYY-MM-DD start, or omit for the most recent closed period" } }, []),
    build: async (a) => {
      let period = s(a.period);
      if (!period) { const p = await db.payrollPeriod.findFirst({ where: { status: "closed" }, orderBy: { periodStart: "desc" } }); if (!p) return { error: "No closed period to mark paid." }; period = p.periodStart.toISOString().slice(0, 10); }
      return { tool: "mark_period_paid", args: { period }, summary: `mark the period starting **${period}** as paid` };
    },
    exec: async (a, actor) => { await payroll.markPeriodPaid(s(a.period)); await logExec(actor, "mark_period_paid", s(a.period)); return `Marked paid.`; },
  },
  create_period: {
    kind: "action",
    def: fn("create_period", "Create a new payroll period.", { start: { type: "string" }, end: { type: "string" }, close: { type: "string" } }, ["start", "end", "close"]),
    build: async (a) => { if (!s(a.start) || !s(a.end) || !s(a.close)) return { error: "I need start, end, and close dates." }; return { tool: "create_period", args: { start: s(a.start), end: s(a.end), close: s(a.close) }, summary: `create a pay period **${a.start} → ${a.end}** (closes ${a.close})` }; },
    exec: async (a, actor) => { await payroll.createPeriod({ periodStart: a.start, periodEnd: a.end, closeDate: a.close }); await logExec(actor, "create_period", s(a.start)); return `Period created.`; },
  },
  set_pay_rate: {
    kind: "action",
    def: fn("set_pay_rate", "Set a role's pay rate.", { role: { type: "string", enum: COMP_ROLES }, hourlyRate: { type: "number" }, salaryPerPeriod: { type: "number" } }, ["role"]),
    build: async (a) => {
      const role = s(a.role).toUpperCase(); if (!COMP_ROLES.includes(role)) return { error: `"${a.role}" isn't a valid role.` };
      const hr2 = num(a.hourlyRate), sal = num(a.salaryPerPeriod);
      if (hr2 === null && sal === null) return { error: "Tell me the new hourly rate or salary." };
      return { tool: "set_pay_rate", args: { role, hourlyRate: hr2, salaryPerPeriod: sal }, summary: `set **${role}** pay to ${hr2 !== null ? `$${hr2}/hr` : `$${sal}/period`}` };
    },
    exec: async (a, actor) => {
      const role = s(a.role) as CompRole; const data: Record<string, unknown> = {};
      if (a.hourlyRate != null) data.hourlyRate = Number(a.hourlyRate);
      if (a.salaryPerPeriod != null) data.salaryPerPeriod = Number(a.salaryPerPeriod);
      await db.compensationRole.update({ where: { roleId: role }, data });
      await logExec(actor, "set_pay_rate", role, data);
      return `Pay rate updated for **${role}**.`;
    },
  },
  // ----- recruitment -----
  move_candidate: {
    kind: "action",
    def: fn("move_candidate", "Move a candidate to a pipeline stage.", { candidate: { type: "string" }, stage: { type: "string", enum: STAGES } }, ["candidate", "stage"]),
    build: async (a) => { const c = await resolveCandidate(s(a.candidate)); const stage = s(a.stage); if (!c) return { error: `I couldn't find a candidate matching "${a.candidate}".` }; if (!STAGES.includes(stage)) return { error: `"${a.stage}" isn't a valid stage.` }; return { tool: "move_candidate", args: { candidateId: c.candidateId, stage }, summary: `move **${c.name}** to **${stage}**` }; },
    exec: async (a, actor) => { await rec.setStage(s(a.candidateId), s(a.stage)); await logExec(actor, "move_candidate", s(a.candidateId), { stage: a.stage }); return `Moved to **${a.stage}**.`; },
  },
  invite_training: {
    kind: "action",
    def: fn("invite_training", "Invite a candidate to the 10-hour training (sends link + assignment).", { candidate: { type: "string" } }, ["candidate"]),
    build: async (a) => { const c = await resolveCandidate(s(a.candidate)); if (!c) return { error: `I couldn't find a candidate matching "${a.candidate}".` }; return { tool: "invite_training", args: { candidateId: c.candidateId }, summary: `invite **${c.name}** to the 10-hour training` }; },
    exec: async (a, actor) => { await rec.decide(s(a.candidateId), "invite_tenhr", undefined, actor); await logExec(actor, "invite_training", s(a.candidateId)); return `Invited to training.`; },
  },
  decide_candidate: {
    kind: "action",
    def: fn("decide_candidate", "Make a hire decision: waitlist or reject a candidate.", { candidate: { type: "string" }, decision: { type: "string", enum: ["waitlist", "reject", "invite_tenhr"] } }, ["candidate", "decision"]),
    build: async (a) => { const c = await resolveCandidate(s(a.candidate)); const d = s(a.decision); if (!c) return { error: `I couldn't find a candidate matching "${a.candidate}".` }; if (!["waitlist", "reject", "invite_tenhr"].includes(d)) return { error: `"${a.decision}" isn't a valid decision.` }; return { tool: "decide_candidate", args: { candidateId: c.candidateId, decision: d }, summary: `**${d}** candidate **${c.name}**` }; },
    exec: async (a, actor) => { await rec.decide(s(a.candidateId), s(a.decision), undefined, actor); await logExec(actor, "decide_candidate", s(a.candidateId), { decision: a.decision }); return `Done — ${a.decision}.`; },
  },
  gate_result: {
    kind: "action",
    def: fn("gate_result", "Pass or fail a candidate's 10-hour gate.", { candidate: { type: "string" }, result: { type: "string", enum: ["pass", "fail", "pending"] } }, ["candidate", "result"]),
    build: async (a) => { const c = await resolveCandidate(s(a.candidate)); const r = s(a.result); if (!c) return { error: `I couldn't find a candidate matching "${a.candidate}".` }; if (!["pass", "fail", "pending"].includes(r)) return { error: `"${a.result}" isn't valid.` }; return { tool: "gate_result", args: { candidateId: c.candidateId, result: r }, summary: `mark **${c.name}**'s 10-hour gate as **${r}**` }; },
    exec: async (a, actor) => { await rec.gateReview(s(a.candidateId), s(a.result), undefined, actor); await logExec(actor, "gate_result", s(a.candidateId), { result: a.result }); return `Gate marked **${a.result}**.`; },
  },
  sign_contract: {
    kind: "action",
    def: fn("sign_contract", "Mark a candidate's contract signed and provision them as a VA.", { candidate: { type: "string" } }, ["candidate"]),
    build: async (a) => { const c = await resolveCandidate(s(a.candidate)); if (!c) return { error: `I couldn't find a candidate matching "${a.candidate}".` }; return { tool: "sign_contract", args: { candidateId: c.candidateId }, summary: `mark **${c.name}**'s contract signed and provision them as a trainee VA` }; },
    exec: async (a, actor) => { await rec.markContractSigned(s(a.candidateId)); await logExec(actor, "sign_contract", s(a.candidateId)); return `Signed — VA provisioned.`; },
  },
  // ----- onboarding -----
  onboarding_flag: {
    kind: "action",
    def: fn("onboarding_flag", "Tick an onboarding checklist item for a VA.", { va: { type: "string" }, field: { type: "string", description: "e.g. gmailCreated, desklogCreated, whatsappAdded, contractUploaded, ndaUploaded, taxFormDone, paymentFormDone, headshotUploaded, handbookAck" }, value: { type: "boolean" } }, ["va", "field"]),
    build: async (a) => { const va = await vaArg(a); if (!va) return { error: `I couldn't find a VA matching "${a.va}".` }; const value = a.value === undefined ? true : a.value; return { tool: "onboarding_flag", args: { vaId: va.vaId, field: s(a.field), value }, summary: `set **${va.name}**'s onboarding **${a.field}** to **${value}**` }; },
    exec: async (a, actor) => { await onb.setFlag(s(a.vaId), s(a.field), a.value); await logExec(actor, "onboarding_flag", s(a.vaId), { field: a.field }); return `Updated **${a.field}**.`; },
  },
  complete_onboarding: {
    kind: "action",
    def: fn("complete_onboarding", "Mark a VA's onboarding complete.", { va: { type: "string" } }, ["va"]),
    build: async (a) => { const va = await vaArg(a); if (!va) return { error: `I couldn't find a VA matching "${a.va}".` }; return { tool: "complete_onboarding", args: { vaId: va.vaId }, summary: `mark **${va.name}**'s onboarding complete` }; },
    exec: async (a, actor) => { await onb.markComplete(s(a.vaId)); await logExec(actor, "complete_onboarding", s(a.vaId)); return `Onboarding complete.`; },
  },
  add_assignment: {
    kind: "action",
    def: fn("add_assignment", "Add a training assignment to the bank.", { task: { type: "string" }, instructions: { type: "string" }, link: { type: "string" } }, ["task"]),
    build: async (a) => { if (!s(a.task)) return { error: "What's the assignment called?" }; return { tool: "add_assignment", args: { task: s(a.task), instructions: s(a.instructions), link: s(a.link) }, summary: `add training assignment **${a.task}**${a.link ? ` (${a.link})` : ""}` }; },
    exec: async (a, actor) => { await db.trainingAssignment.create({ data: { task: s(a.task), instructions: s(a.instructions) || null, instructionsLink: s(a.link) || null, active: true } }); await logExec(actor, "add_assignment", s(a.task)); return `Assignment added.`; },
  },
  // ----- comms / ops -----
  email_vas: {
    kind: "action",
    def: fn("email_vas", "Email one VA or all active VAs (e.g. a check-in reminder).", { scope: { type: "string", enum: ["all", "one"] }, va: { type: "string" }, subject: { type: "string" }, message: { type: "string" } }, ["scope", "subject", "message"]),
    build: async (a) => {
      const scope = s(a.scope) === "one" ? "one" : "all";
      if (!s(a.subject) || !s(a.message)) return { error: "I need a subject and a message." };
      if (scope === "one") { const va = await vaArg(a); if (!va) return { error: `I couldn't find a VA matching "${a.va}".` }; return { tool: "email_vas", args: { scope, vaId: va.vaId, subject: s(a.subject), message: s(a.message) }, summary: `email **${va.name}** — "${a.subject}"` }; }
      const n = await db.va.count({ where: { status: { in: ["active", "training"] } } });
      return { tool: "email_vas", args: { scope, subject: s(a.subject), message: s(a.message) }, summary: `email all **${n}** active VAs — "${a.subject}"` };
    },
    exec: async (a, actor) => {
      const settings = await loadSettings(); const from = str(settings, "system_email_from", "");
      if (!from) throw new Error("No send-from address configured (Setting system_email_from).");
      const recipients = a.scope === "one"
        ? await db.va.findMany({ where: { vaId: s(a.vaId) }, select: { email: true, name: true } })
        : await db.va.findMany({ where: { status: { in: ["active", "training"] } }, select: { email: true, name: true } });
      let sent = 0;
      for (const r of recipients) { if (r.email) { await sendSystemEmail({ from, to: r.email, subject: s(a.subject), body: s(a.message) }); sent++; } }
      await logActivity({ source: "purii_bypass", eventType: "email_sent", summary: `${actor} emailed ${sent} VA(s) via Purii: ${a.subject}` });
      await logExec(actor, "email_vas", null, { sent, subject: a.subject });
      return `Sent to **${sent}** VA(s).`;
    },
  },
  set_nudges: {
    kind: "action",
    def: fn("set_nudges", "Turn the daily email nudges (reminding HR/recruiter/bookkeeper about waiting items) on or off.", { on: { type: "boolean" } }, ["on"]),
    build: async (a) => {
      const on = a.on === true || s(a.on).toLowerCase() === "true" || s(a.on).toLowerCase() === "on" || s(a.on).toLowerCase() === "yes";
      return { tool: "set_nudges", args: { on }, summary: `turn the daily email nudges **${on ? "ON" : "OFF"}**` };
    },
    exec: async (a, actor) => {
      const on = a.on === true;
      await db.setting.upsert({ where: { key: "nudge_enabled" }, update: { value: on ? "TRUE" : "FALSE" }, create: { key: "nudge_enabled", value: on ? "TRUE" : "FALSE" } });
      await logActivity({ source: "purii_bypass", eventType: "nudges_toggled", severity: "info", summary: `${actor} turned daily nudges ${on ? "on" : "off"} via Purii` });
      await logExec(actor, "set_nudges", null, { on });
      return `Daily email nudges are now **${on ? "ON" : "OFF"}**.`;
    },
  },
  run_worker: {
    kind: "action",
    def: fn("run_worker", "Run an automation now.", { worker: { type: "string", enum: WORKERS } }, ["worker"]),
    build: async (a) => { const w = s(a.worker); if (!WORKERS.includes(w)) return { error: `I can run: ${WORKERS.join(", ")}.` }; return { tool: "run_worker", args: { worker: w }, summary: `run the **${w}** automation now` }; },
    exec: async (a, actor) => {
      const w = s(a.worker); if (!WORKERS.includes(w)) throw new Error("Unknown worker");
      spawn("npx", ["tsx", `worker/${w}.ts`], { cwd: process.cwd(), detached: true, stdio: "ignore" }).unref();
      await logExec(actor, "run_worker", w);
      return `Started the **${w}** job.`;
    },
  },
  // ----- queries (read-only) -----
  who_overburdened: {
    kind: "query",
    def: fn("who_overburdened", "List VAs currently flagged overburdened or underutilized.", {}, []),
    run: async () => { const { flagged } = await getCapacity(); if (!flagged.length) return "No VAs are currently flagged. 🎉"; return flagged.map((f) => `• ${f.va.name} — ${Math.round(f.utilizationPct)}% (${f.overburdened ? "overburdened" : f.underutilized ? "underutilized" : "tracking gap"})`).join("\n"); },
  },
  va_stats: {
    kind: "query",
    def: fn("va_stats", "Get a VA's hours, tier, and utilization.", { va: { type: "string" } }, ["va"]),
    run: async (a) => { const va = await vaArg(a); if (!va) return `I couldn't find a VA matching "${a.va}".`; const d = await getVaDashboard(va.vaId); return `**${d.va.name}** — ${d.va.compensationRole}\n• Cumulative: ${Math.round(d.cumulative)}h\n• Last 14 days: ${d.last14.toFixed(1)}h\n• Utilization: ${Math.round(d.utilizationPct)}%${d.eligibility.eligible ? "\n• Eligible for promotion ✅" : ""}`; },
  },
  payroll_summary: {
    kind: "query",
    def: fn("payroll_summary", "Summarize the open payroll period.", {}, []),
    run: async () => { const d = await getPayrollDashboard(); if (!d.openPeriod) return "No open payroll period."; return `Open period: ${d.openPeriod.periodStart.toISOString().slice(0, 10)} → ${d.openPeriod.periodEnd.toISOString().slice(0, 10)}\n• Total hours: ${d.totalHours.toFixed(1)}\n• Gross payroll: $${d.totalGross.toFixed(2)}`; },
  },
  missing_checkins: {
    kind: "query",
    def: fn("missing_checkins", "List VAs who haven't checked in this month.", {}, []),
    run: async () => { const rows = await getCheckins(); const missing = rows.filter((r) => !r.thisMonth); if (!missing.length) return "Everyone has checked in this month. 🎉"; return missing.map((r) => `• ${r.va.name}${r.ageDays != null ? ` (${r.ageDays}d ago)` : " (never)"}`).join("\n"); },
  },
  gate_ready: {
    kind: "query",
    def: fn("gate_ready", "List candidates ready for the 10-hour gate review.", {}, []),
    run: async () => { const c = await db.candidate.findMany({ where: { trainingReadyForReview: true }, select: { name: true, email: true, trainingTotalMinutes: true } }); if (!c.length) return "No candidates are ready for gate review yet."; return c.map((x) => `• ${x.name ?? x.email} — ${(x.trainingTotalMinutes / 60).toFixed(1)}h`).join("\n"); },
  },
  pipeline_counts: {
    kind: "query",
    def: fn("pipeline_counts", "Show candidate counts by pipeline stage.", {}, []),
    run: async () => { const p = await getPipeline(); return Object.entries(p.counts).filter(([, n]) => (n as number) > 0).map(([k, n]) => `• ${k}: ${n}`).join("\n") || "No candidates in the pipeline."; },
  },
  nudges_status: {
    kind: "query",
    def: fn("nudges_status", "Check whether the daily email nudges are on or off.", {}, []),
    run: async () => { const r = await db.setting.findUnique({ where: { key: "nudge_enabled" } }); return `Daily email nudges are **${(r?.value ?? "").toUpperCase() === "TRUE" ? "ON" : "OFF"}**.`; },
  },
  top_hours: {
    kind: "query",
    def: fn("top_hours", "Top VAs by total tracked hours.", { limit: { type: "number" } }, []),
    run: async (a) => {
      const limit = num(a.limit) ?? 5;
      const rows = await db.deskLogHours.groupBy({ by: ["vaId"], _sum: { taskSpentHrs: true } });
      const names = new Map((await db.va.findMany({ select: { vaId: true, name: true } })).map((v) => [v.vaId, v.name]));
      return rows.map((r) => ({ name: names.get(r.vaId) ?? r.vaId, h: r._sum.taskSpentHrs ?? 0 })).sort((x, y) => y.h - x.h).slice(0, limit).map((r, i) => `${i + 1}. ${r.name} — ${Math.round(r.h)}h`).join("\n");
    },
  },

  // ----- Projects & Tasks (reuses the same actions/MCP tools as the UI) -----
  create_task: {
    kind: "action",
    def: fn("create_task", "Create and assign a task, optionally on a project. Project/assignee are resolved by name or email.", { title: { type: "string" }, project: { type: "string" }, assignee: { type: "string" }, priority: { type: "string", enum: ["Low", "Medium", "High"] }, dueDate: { type: "string" } }, ["title"]),
    build: async (a) => {
      const title = s(a.title);
      if (!title) return { error: "What should the task be called?" };
      const on = s(a.project) ? ` on **${s(a.project)}**` : "";
      const who = s(a.assignee) ? `**${s(a.assignee)}**` : "you";
      return { tool: "create_task", args: { title, project: s(a.project), assignee: s(a.assignee), priority: s(a.priority), dueDate: s(a.dueDate) }, summary: `create task **${title}**${on}, assigned to ${who}` };
    },
    exec: async (a, actor) => {
      const ctx = await taskActorCtx(actor);
      const r = await mcpTaskTool("create_task", { title: s(a.title), project: s(a.project), assignee: s(a.assignee), priority: s(a.priority), dueDate: s(a.dueDate) }, ctx);
      return r.isError ? `Hmm — ${r.text}` : `Done — created **${s(a.title)}**. ✅`;
    },
  },
  update_task_status: {
    kind: "action",
    def: fn("update_task_status", "Change a task's status. Identify the task by title or id.", { task: { type: "string" }, status: { type: "string", enum: ["NotStarted", "InProgress", "Done", "Blocked"] } }, ["task", "status"]),
    build: async (a) => {
      const t = await resolveTaskRef(s(a.task));
      if (!t) return { error: `I couldn't find a task matching "${s(a.task)}".` };
      const st = s(a.status);
      if (!["NotStarted", "InProgress", "Done", "Blocked"].includes(st)) return { error: "Status must be NotStarted, InProgress, Done, or Blocked." };
      return { tool: "update_task_status", args: { taskId: t.id, status: st }, summary: `set **${t.title}** to **${st}**` };
    },
    exec: async (a, actor) => {
      const ctx = await taskActorCtx(actor);
      const u = await tasksActions.updateTaskStatus(ctx.actorId, ctx.actorRole, s(a.taskId), s(a.status) as TaskStatusT);
      return `Done — **${u.title}** is now **${u.status}**. ✅`;
    },
  },
  reassign_task: {
    kind: "action",
    def: fn("reassign_task", "Reassign a task to a different teammate. Task by title/id, assignee by name/email.", { task: { type: "string" }, assignee: { type: "string" } }, ["task", "assignee"]),
    build: async (a) => {
      const t = await resolveTaskRef(s(a.task));
      if (!t) return { error: `No task matched "${s(a.task)}".` };
      const u = await resolveUserRef(s(a.assignee));
      if (!u) return { error: `No teammate matched "${s(a.assignee)}".` };
      return { tool: "reassign_task", args: { taskId: t.id, assigneeId: u.id }, summary: `reassign **${t.title}** to **${u.name ?? u.email}**` };
    },
    exec: async (a, actor) => {
      const ctx = await taskActorCtx(actor);
      const r = await tasksActions.reassignTask(ctx.actorId, ctx.actorRole, s(a.taskId), s(a.assigneeId));
      return `Done — **${r.title}** reassigned to **${r.assignee}**. ✅`;
    },
  },
  delete_task: {
    kind: "action",
    def: fn("delete_task", "Permanently delete a task. Identify it by title or id.", { task: { type: "string" } }, ["task"]),
    build: async (a) => {
      const t = await resolveTaskRef(s(a.task));
      if (!t) return { error: `No task matched "${s(a.task)}".` };
      return { tool: "delete_task", args: { taskId: t.id }, summary: `permanently delete task **${t.title}**` };
    },
    exec: async (a, actor) => {
      const ctx = await taskActorCtx(actor);
      const r = await tasksActions.deleteTask(ctx.actorId, ctx.actorRole, s(a.taskId));
      return `Deleted **${r.title}**. 🗑️`;
    },
  },
  list_tasks: {
    kind: "query",
    def: fn("list_tasks", "List tasks, optionally for one project or status.", { project: { type: "string" }, status: { type: "string" } }, []),
    run: async (a) => (await mcpTaskTool("list_tasks", { project: s(a.project), status: s(a.status) }, READONLY_CTX)).text,
  },
  list_projects: {
    kind: "query",
    def: fn("list_projects", "List projects with status, client, and task counts.", { status: { type: "string" } }, []),
    run: async (a) => (await mcpTaskTool("list_projects", { status: s(a.status) }, READONLY_CTX)).text,
  },
};

export const BYPASS_TOOLS = Object.values(TOOLS).map((t) => t.def);
export function toolKind(name: string): "action" | "query" | undefined { return TOOLS[name]?.kind; }

export async function buildProposal(name: string, args: Record<string, unknown>): Promise<Built> {
  const t = TOOLS[name];
  if (!t || t.kind !== "action" || !t.build) return { error: "I don't know how to do that yet." };
  return t.build(args);
}
export async function executeAction(name: string, args: Record<string, unknown>, actorEmail: string): Promise<string> {
  const t = TOOLS[name];
  if (!t || t.kind !== "action" || !t.exec) throw new Error("Unknown action");
  return t.exec(args, actorEmail);
}
export async function runQuery(name: string, args: Record<string, unknown>): Promise<string> {
  const t = TOOLS[name];
  if (!t || t.kind !== "query" || !t.run) return "I'm not sure how to look that up.";
  return t.run(args);
}
