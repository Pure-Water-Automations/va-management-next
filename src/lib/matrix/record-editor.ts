import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit, logActivity } from "@/lib/activity";
import type { Proposal } from "@/lib/purii-actions";

const ALLOWED_MODELS = new Set([
  "Va", "Candidate", "CompensationRole", "Setting", "Onboarding", "TierReview", "Evaluation",
  "DeskLogHours", "DeskLogEfficiency", "CapacityFlagEvent", "TrainingAssignment", "TrainingSession",
  "TrainingTaskProgress", "PayrollPeriod", "PayrollCalculation", "NotionRef", "Policy",
]);
const BLOCKED_FIELDS = new Set(["id", "createdAt", "updatedAt", "lastUpdated"]);

function meta(model: string) {
  return Prisma.dmmf.datamodel.models.find((m) => m.name === model) ?? null;
}
function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

type Valid = { ok: true; delegate: string } | { ok: false; error: string };

/** All safety guards for edit_record (pure — no DB). Re-run at exec time. */
export function validateEdit(model: string, where: Record<string, unknown>, data: Record<string, unknown>): Valid {
  if (!ALLOWED_MODELS.has(model)) {
    return { ok: false, error: `I can only edit business records (VAs, candidates, settings, etc.) — never "${model}" (logins, audit, or schema are off-limits).` };
  }
  const m = meta(model);
  if (!m) return { ok: false, error: `Unknown model "${model}".` };

  const uniqueNames = new Set(m.fields.filter((f) => f.isId || f.isUnique).map((f) => f.name));
  const whereKeys = Object.keys(where ?? {});
  if (!whereKeys.length || !whereKeys.every((k) => uniqueNames.has(k))) {
    return { ok: false, error: "To stay safe I only change ONE record at a time — identify it by its id or a unique field." };
  }

  const editable = new Set(
    m.fields.filter((f) => (f.kind === "scalar" || f.kind === "enum") && !f.isId && !BLOCKED_FIELDS.has(f.name)).map((f) => f.name),
  );
  const dataKeys = Object.keys(data ?? {});
  if (!dataKeys.length) return { ok: false, error: "Tell me what to change." };
  for (const k of dataKeys) {
    if (!editable.has(k)) return { ok: false, error: `I can't set "${k}" on ${model} (it's not an editable field).` };
  }
  return { ok: true, delegate: delegateName(model) };
}

export async function buildRecordEdit(args: Record<string, unknown>): Promise<Proposal | { error: string }> {
  const model = String(args.model ?? "");
  const where = (args.where ?? {}) as Record<string, unknown>;
  const data = (args.data ?? {}) as Record<string, unknown>;
  const v = validateEdit(model, where, data);
  if (!v.ok) return { error: v.error };
  const current = await (db as Record<string, any>)[v.delegate].findUnique({ where });
  if (!current) return { error: `No ${model} matches ${JSON.stringify(where)}.` };
  const diff = Object.keys(data)
    .map((k) => `${k}: ${JSON.stringify(current[k])} → ${JSON.stringify(data[k])}`)
    .join("; ");
  return { tool: "edit_record", args: { model, delegate: v.delegate, where, data }, summary: `update ${model} (${JSON.stringify(where)}) — ${diff}` };
}

export async function executeRecordEdit(args: Record<string, unknown>, actor: string): Promise<string> {
  const model = String(args.model ?? "");
  const where = (args.where ?? {}) as Record<string, unknown>;
  const data = (args.data ?? {}) as Record<string, unknown>;
  const v = validateEdit(model, where, data); // defense-in-depth: re-validate on execute
  if (!v.ok) throw new Error(v.error);
  await (db as Record<string, any>)[v.delegate].update({ where, data });
  await audit({ actorEmail: actor, action: "bypass.edit_record", target: model, details: { matrix: true, model, where, data } });
  await logActivity({ source: "purii_matrix", eventType: "record_edited", severity: "warning", summary: `${actor} edited ${model} via Matrix: ${JSON.stringify(where)}` });
  return `Updated **${model}**. ✅`;
}

export const EDIT_RECORD_TOOL = {
  type: "function" as const,
  function: {
    name: "edit_record",
    description:
      "Update ONE business record by its id or unique field. Allowed models: Va, Candidate, CompensationRole, Setting, Onboarding, TierReview, Evaluation, DeskLogHours, DeskLogEfficiency, CapacityFlagEvent, TrainingAssignment, TrainingSession, TrainingTaskProgress, PayrollPeriod, PayrollCalculation, NotionRef, Policy. Cannot touch logins/auth, audit logs, or the schema; cannot delete or bulk-update. The system shows the operator a confirmation before applying.",
    parameters: {
      type: "object",
      properties: {
        model: { type: "string", description: "Prisma model name, e.g. Va" },
        where: { type: "object", description: "unique selector, e.g. { vaId: 'aira_m' } or { key: 'nudge_enabled' }" },
        data: { type: "object", description: "fields to set, e.g. { targetHoursWeekly: 25 }" },
      },
      required: ["model", "where", "data"],
    },
  },
};
