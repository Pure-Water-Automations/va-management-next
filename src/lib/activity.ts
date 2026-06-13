import { db } from "@/lib/db";

/** Append an Activity_Log row (mirrors the GAS appendActivity_ helper). */
export async function logActivity(input: {
  source: string;
  eventType: string;
  summary: string;
  vaId?: string | null;
  severity?: "success" | "info" | "warning" | "error";
}): Promise<void> {
  await db.activityLog.create({
    data: {
      source: input.source,
      eventType: input.eventType,
      summary: input.summary,
      vaId: input.vaId ?? null,
      severity: input.severity ?? "info",
    },
  });
}

/** Append a tamper-evident AuditLog row (who did what, independent of Activity_Log). */
export async function audit(input: {
  actorEmail?: string | null;
  action: string;
  target?: string | null;
  ok?: boolean;
  details?: Record<string, unknown>;
}): Promise<void> {
  await db.auditLog.create({
    data: {
      actorEmail: input.actorEmail ?? null,
      action: input.action,
      target: input.target ?? null,
      ok: input.ok ?? true,
      details: input.details ? (input.details as object) : undefined,
    },
  });
}
