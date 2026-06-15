import { db } from "@/lib/db";
import type { ConsoleView } from "@/lib/auth/roles";
import { getCapacity } from "@/lib/reads/hr-extra";

/**
 * Pending-action items per console domain — powers Purii's notification badge,
 * her spoken summary, and the email nudges. An "item" is something a specific
 * person is expected to act on.
 */
export type NotItem = { key: string; label: string; count: number; href: string };

const OPEN_REVIEW = ["hours_triggered", "form_sent", "under_review"];
const plural = (n: number, one: string, many = one + "s") => (n === 1 ? one : many);

export type Domain = "HR" | "RECRUITMENT" | "PAYROLL" | "VA";

const todayMidnight = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export async function itemsForDomain(domain: Domain, vaId?: string | null): Promise<NotItem[]> {
  const items: NotItem[] = [];

  if (domain === "HR") {
    const [reviews, flagged, decisions, gate, evals] = await Promise.all([
      db.tierReview.count({ where: { status: { in: OPEN_REVIEW as never } } }),
      getCapacity().then((c) => c.flagged.length),
      db.candidate.count({ where: { currentStage: { in: ["interviewed", "decision"] } } }),
      db.candidate.count({ where: { trainingReadyForReview: true, currentStage: "tenhr_in_progress" } }),
      db.evaluation.count({ where: { status: "ready_for_review" } }),
    ]);
    if (reviews) items.push({ key: "tier", count: reviews, label: `tier ${plural(reviews, "review")} waiting for your approval`, href: "/hr/reviews" });
    if (evals) items.push({ key: "eval", count: evals, label: `${plural(evals, "evaluation")} ready to finalize`, href: "/hr/evaluations" });
    if (flagged) items.push({ key: "capacity", count: flagged, label: `capacity ${plural(flagged, "flag")} to review`, href: "/hr/capacity" });
    if (decisions) items.push({ key: "decide", count: decisions, label: `${plural(decisions, "candidate")} waiting on your hire decision`, href: "/recruitment" });
    if (gate) items.push({ key: "gate", count: gate, label: `${plural(gate, "candidate")} ready for gate review`, href: "/recruitment/gate" });
  }

  if (domain === "RECRUITMENT") {
    const [apps, interviews] = await Promise.all([
      db.candidate.count({ where: { currentStage: "applied" } }),
      db.candidate.count({ where: { currentStage: "interview_scheduled" } }),
    ]);
    if (apps) items.push({ key: "review", count: apps, label: `new ${plural(apps, "application")} to review`, href: "/recruitment" });
    if (interviews) items.push({ key: "interview", count: interviews, label: `${plural(interviews, "interview")} to conduct`, href: "/recruitment" });
  }

  if (domain === "PAYROLL") {
    const [openToClose, toPay] = await Promise.all([
      db.payrollPeriod.count({ where: { status: "open", closeDate: { lte: todayMidnight() } } }),
      db.payrollPeriod.count({ where: { status: "closed" } }),
    ]);
    if (openToClose) items.push({ key: "close", count: openToClose, label: `payroll ${plural(openToClose, "period")} ready to close`, href: "/payroll" });
    if (toPay) items.push({ key: "pay", count: toPay, label: `${plural(toPay, "period")} to mark paid`, href: "/payroll" });
  }

  if (domain === "VA" && vaId) {
    const [va, selfEval, supEvals, attestation] = await Promise.all([
      db.va.findUnique({ where: { vaId }, select: { lastCheckinDate: true } }),
      db.evaluation.count({ where: { vaId, selfSubmittedAt: null, status: { in: ["forms_sent", "self_submitted", "supervisor_submitted", "ready_for_review"] } } }),
      db.evaluation.count({ where: { supervisorVaId: vaId, supervisorSubmittedAt: null, status: { in: ["forms_sent", "self_submitted", "supervisor_submitted", "ready_for_review"] } } }),
      db.tierReview.count({ where: { vaId, status: { in: ["hours_triggered", "form_sent"] } } }),
    ]);
    const due = !va?.lastCheckinDate || Date.now() - va.lastCheckinDate.getTime() > 30 * 86400000;
    if (attestation) items.push({ key: "attest", count: attestation, label: "a skill attestation to complete for your tier review", href: "/va/tier" });
    if (selfEval) items.push({ key: "self_eval", count: selfEval, label: "an evaluation self-assessment to complete", href: "/va/evaluation" });
    if (supEvals) items.push({ key: "sup_eval", count: supEvals, label: `${plural(supEvals, "team evaluation")} to complete for your reports`, href: "/va/evaluation" });
    if (due) items.push({ key: "checkin", count: 1, label: "your monthly check-in is due", href: "/va/checkin" });
  }

  return items;
}

const VIEW_DOMAIN: Record<ConsoleView, Domain> = { HR: "HR", RECRUITMENT: "RECRUITMENT", PAYROLL: "PAYROLL", VA: "VA" };

export async function notificationsForView(view: ConsoleView, opts: { name?: string; vaId?: string | null } = {}) {
  const items = await itemsForDomain(VIEW_DOMAIN[view], opts.vaId);
  const count = items.reduce((s, i) => s + i.count, 0);
  const first = (opts.name ?? "there").split(" ")[0];
  let greeting: string;
  if (items.length === 0) {
    greeting = `Hey ${first}! You're all caught up — nothing needs your attention right now. 🎉`;
  } else {
    const phrases = items.map((i) => `**${i.count}** ${i.label}`);
    const joined = phrases.length === 1 ? phrases[0] : phrases.slice(0, -1).join(", ") + ", and " + phrases[phrases.length - 1];
    greeting = `Hey ${first}! You have ${joined}.`;
  }
  return { count, items, greeting };
}

/** Plain-text nudge body for the email to a responsible person. */
export function nudgeBody(name: string | undefined, items: NotItem[], baseUrl: string): string {
  const first = (name ?? "there").split(" ")[0];
  const lines = items.map((i) => `• ${i.count} ${i.label}`).join("\n");
  return `Hi ${first},\n\nA quick nudge — you have items waiting in the VA Management console:\n\n${lines}\n\nOpen it here: ${baseUrl}\n\n— Purii`;
}
