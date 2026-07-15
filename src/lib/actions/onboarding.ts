import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { sendSystemEmail } from "@/lib/email";
import { loadSettings } from "@/lib/settings";

const BOOLEAN_FIELDS = new Set([
  "gmailCreated",
  "desklogCreated",
  "whatsappAdded",
  "contractUploaded",
  "ndaUploaded",
  "taxFormDone",
  "paymentFormDone",
  "headshotUploaded",
  "handbookAck",
]);

const TEXT_FIELDS = new Set(["taxFormType", "paymentMethod", "notes"]);

const ALLOWED_FIELDS = new Set([...BOOLEAN_FIELDS, ...TEXT_FIELDS]);

function coerceBoolean(value: unknown, field: string): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(normalized)) return true;
    if (["false", "no", "0"].includes(normalized)) return false;
  }
  throw new Error(`${field} must be a boolean`);
}

function coerceText(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error(`${field} must be text`);
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function setField(data: Prisma.OnboardingUpdateInput, field: string, value: unknown): void {
  switch (field) {
    case "gmailCreated":
      data.gmailCreated = coerceBoolean(value, field);
      return;
    case "desklogCreated":
      data.desklogCreated = coerceBoolean(value, field);
      return;
    case "whatsappAdded":
      data.whatsappAdded = coerceBoolean(value, field);
      return;
    case "contractUploaded":
      data.contractUploaded = coerceBoolean(value, field);
      return;
    case "ndaUploaded":
      data.ndaUploaded = coerceBoolean(value, field);
      return;
    case "taxFormDone":
      data.taxFormDone = coerceBoolean(value, field);
      return;
    case "paymentFormDone":
      data.paymentFormDone = coerceBoolean(value, field);
      return;
    case "headshotUploaded":
      data.headshotUploaded = coerceBoolean(value, field);
      return;
    case "handbookAck":
      data.handbookAck = coerceBoolean(value, field);
      return;
    case "taxFormType":
      data.taxFormType = coerceText(value, field);
      return;
    case "paymentMethod":
      data.paymentMethod = coerceText(value, field);
      return;
    case "notes":
      data.notes = coerceText(value, field);
      return;
    default:
      throw new Error(`Field not allowed: ${field}`);
  }
}

function logValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  if (value == null) return "";
  return JSON.stringify(value);
}

export async function setFlag(
  vaId: string,
  field: string,
  value: unknown,
  note?: string,
) {
  if (!ALLOWED_FIELDS.has(field)) throw new Error(`Field not allowed: ${field}`);

  const row = await db.onboarding.findUnique({ where: { vaId } });
  if (!row) throw new Error(`No onboarding record for ${vaId}`);

  const data: Prisma.OnboardingUpdateInput = {};
  setField(data, field, value);
  if (row.status === "pending") data.status = "in_progress";
  if (note?.trim() && field !== "notes") data.notes = note.trim();

  const updated = await db.onboarding.update({
    where: { vaId },
    data,
  });

  await logActivity({
    source: "hr_action",
    eventType: "onboarding_flag",
    vaId,
    summary: `${updated.vaName ?? vaId} onboarding: ${field} = ${logValue(value)}`,
  });

  return updated;
}

export function welcomeEmailBody(vaName: string, company: string): string {
  const first = vaName.trim().split(/\s+/)[0] || "there";
  return [
    `Hi ${first},`,
    "",
    `Welcome to ${company}! Your onboarding checklist is complete and your account is set up.`,
    "",
    "You can sign in to your VA console to see your tasks, log your monthly check-in, and track your tier progress.",
    "",
    `— ${company}`,
  ].join("\n");
}

export async function markComplete(vaId: string) {
  const row = await db.onboarding.findUnique({ where: { vaId } });
  if (!row) throw new Error(`No onboarding record for ${vaId}`);

  const updated = await db.onboarding.update({ where: { vaId }, data: { status: "completed" } });

  // Activate the VA: console-hired VAs start `training` (see createVaFromCandidate)
  // and nothing else flips them to `active` short of a tier-promotion evaluation,
  // so completing onboarding left them stranded in `training` with 0 utilization.
  await db.va.updateMany({ where: { vaId, status: "training" }, data: { status: "active" } });

  // Advance the linked candidate off the dead-end onboarding stage.
  const candidate = await db.candidate.findFirst({ where: { vaId, currentStage: "onboarding" } });
  if (candidate) {
    await db.candidate.update({ where: { candidateId: candidate.candidateId }, data: { currentStage: "closed" } });
  }

  // Welcome the new VA (best-effort).
  const va = await db.va.findUnique({ where: { vaId } });
  if (va?.email) {
    const settings = await loadSettings();
    const company = settings.get("company_name")?.trim() || "Pure Water Automations";
    const from = settings.get("system_email_from")?.trim() || settings.get("hr_manager_email")?.trim() || "okamotomiak@gmail.com";
    await sendSystemEmail({ from, to: va.email, subject: `Welcome to ${company}!`, body: welcomeEmailBody(va.name, company) })
      .catch((err) => console.warn("markComplete: welcome email failed:", err instanceof Error ? err.message : err));
  }

  await logActivity({
    source: "hr_action",
    eventType: "onboarding_complete",
    severity: "success",
    vaId,
    summary: `${updated.vaName ?? vaId} onboarding complete — VA welcomed, pipeline closed`,
  });

  return updated;
}
