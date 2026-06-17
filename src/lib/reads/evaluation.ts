import { db } from "@/lib/db";

const OPEN: ("forms_sent" | "self_submitted" | "supervisor_submitted" | "ready_for_review")[] = [
  "forms_sent",
  "self_submitted",
  "supervisor_submitted",
  "ready_for_review",
];

/** HR queue: open evaluations (newest first) + recently decided. */
export async function getEvaluationQueue() {
  const [open, decided] = await Promise.all([
    db.evaluation.findMany({
      where: { status: { in: OPEN } },
      orderBy: [{ status: "desc" }, { createdAt: "asc" }],
    }),
    db.evaluation.findMany({
      where: { status: { in: ["approved", "declined"] } },
      orderBy: { decidedAt: "desc" },
      take: 20,
    }),
  ]);
  return { open, decided };
}

/** VAs eligible to have an evaluation started (no open evaluation in flight). */
export async function getStartableVas() {
  const [vas, openEvals] = await Promise.all([
    db.va.findMany({
      where: { status: { in: ["active", "training"] } },
      orderBy: [{ compensationRole: "asc" }, { name: "asc" }],
      select: { vaId: true, name: true, compensationRole: true, status: true, supervisorVaId: true },
    }),
    db.evaluation.findMany({ where: { status: { in: OPEN } }, select: { vaId: true } }),
  ]);
  const busy = new Set(openEvals.map((e) => e.vaId));
  return vas.filter((v) => !busy.has(v.vaId));
}

/** The one open self-assessment a VA still owes, if any. */
export async function getPendingSelfEvaluation(vaId: string) {
  return db.evaluation.findFirst({
    where: { vaId, selfSubmittedAt: null, status: { in: OPEN } },
    orderBy: { createdAt: "asc" },
  });
}

/** Open supervisor assessments a supervisor still owes for their reports. */
export async function getPendingSupervisorEvaluations(supervisorVaId: string) {
  return db.evaluation.findMany({
    where: { supervisorVaId, supervisorSubmittedAt: null, status: { in: OPEN } },
    orderBy: { createdAt: "asc" },
  });
}

export async function getEvaluationDetail(evaluationId: string) {
  return db.evaluation.findUnique({
    where: { evaluationId },
    include: { tierReview: true, va: { select: { name: true, email: true, supervisorVaId: true } } },
  });
}
