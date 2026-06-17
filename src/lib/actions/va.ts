import { db } from "@/lib/db";
import { sendSystemEmail } from "@/lib/email";
import { loadSettings, str as settingStr } from "@/lib/settings";
import { logActivity } from "@/lib/activity";

type CapacityFlag = "overburdened" | "underutilized" | "manual_review";

export type SubmitCheckInInput = {
  targetHoursWeekly?: unknown;
  availabilityNotes?: unknown;
  capacityFlag?: unknown;
  notes?: unknown;
};

export async function submitCheckIn(
  vaIdInput: string | null | undefined,
  input: SubmitCheckInInput,
) {
  const vaId = requireVaId(vaIdInput);
  const targetHoursWeekly = requiredNumber(input.targetHoursWeekly, "targetHoursWeekly");
  const availabilityNotes = optionalText(input.availabilityNotes) ?? "";
  const notes = optionalText(input.notes);
  const capacityFlag = optionalCapacityFlag(input.capacityFlag);
  const now = new Date();

  const va = await db.va.update({
    where: { vaId },
    data: {
      targetHoursWeekly,
      availabilityNotes,
      lastCheckinDate: now,
    },
    select: {
      vaId: true,
      name: true,
      supervisorVaId: true,
    },
  });

  if (capacityFlag === "overburdened") {
    await db.capacityFlagEvent.create({
      data: {
        vaId,
        vaName: va.name,
        flagType: capacityFlag,
        transition: "flagged",
        severity: "red",
        supervisorVaId: va.supervisorVaId,
        notes,
      },
    });
  }

  await logActivity({
    source: "va_action",
    eventType: "check_in_submitted",
    vaId,
    severity: "success",
    summary: `${va.name} submitted a monthly check-in.`,
  });

  return { ok: true, vaId, lastCheckinDate: now };
}

export async function requestTargetHours(
  vaIdInput: string | null | undefined,
  newTargetInput: unknown,
  notesInput?: unknown,
) {
  const vaId = requireVaId(vaIdInput);
  const newTarget = requiredNumber(newTargetInput, "newTarget");
  const notes = optionalText(notesInput);
  const va = await db.va.findUnique({
    where: { vaId },
    select: {
      vaId: true,
      name: true,
      email: true,
    },
  });
  if (!va) throw new Error(`VA not found: ${vaId}`);

  await logActivity({
    source: "va_action",
    eventType: "target_hours_requested",
    vaId,
    severity: "info",
    summary: `${va.name} requested target hours: ${newTarget}.${notes ? ` ${notes}` : ""}`,
  });

  await emailHrTargetHoursRequest(va, newTarget, notes);

  return { ok: true, vaId, requestedTargetHours: newTarget };
}

export async function flagCapacity(
  vaIdInput: string | null | undefined,
  flagInput: unknown,
  notesInput?: unknown,
) {
  const vaId = requireVaId(vaIdInput);
  const flag = requiredCapacityFlag(flagInput);
  const notes = optionalText(notesInput);
  const va = await db.va.findUnique({
    where: { vaId },
    select: {
      vaId: true,
      name: true,
      supervisorVaId: true,
    },
  });
  if (!va) throw new Error(`VA not found: ${vaId}`);

  await db.capacityFlagEvent.create({
    data: {
      vaId,
      vaName: va.name,
      flagType: flag,
      transition: "flagged",
      severity: severityForFlag(flag),
      supervisorVaId: va.supervisorVaId,
      notes,
    },
  });

  await logActivity({
    source: "va_action",
    eventType: "capacity_self_flag",
    vaId,
    severity: flag === "overburdened" ? "warning" : "info",
    summary: `${va.name} self-flagged ${flag}.${notes ? ` ${notes}` : ""}`,
  });

  return { ok: true, vaId, flag };
}

export async function saveSkillNotes(
  vaIdInput: string | null | undefined,
  skillsInput: unknown,
) {
  const vaId = requireVaId(vaIdInput);
  const skills = textOrEmpty(skillsInput);
  const va = await db.va.update({
    where: { vaId },
    data: { skillSpecs: skills },
    select: {
      vaId: true,
      name: true,
    },
  });

  await logActivity({
    source: "va_action",
    eventType: "skill_notes_saved",
    vaId,
    severity: "success",
    summary: `Skill notes updated for ${va.name}.`,
  });

  return { ok: true, vaId };
}

function requireVaId(vaId: string | null | undefined): string {
  if (!vaId) throw new Error("VA ID not found");
  return vaId;
}

function requiredNumber(value: unknown, field: string): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) throw new Error(`Missing field: ${field}`);
  if (n < 0) throw new Error(`${field} must be non-negative`);
  return n;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function textOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalCapacityFlag(value: unknown): CapacityFlag | undefined {
  return value == null || (typeof value === "string" && value.trim() === "")
    ? undefined
    : requiredCapacityFlag(value);
}

function requiredCapacityFlag(value: unknown): CapacityFlag {
  if (value === "overburdened" || value === "underutilized" || value === "manual_review") {
    return value;
  }
  throw new Error("Invalid capacity flag");
}

function severityForFlag(flag: CapacityFlag): "red" | "yellow" | "green" {
  if (flag === "overburdened") return "red";
  if (flag === "underutilized") return "yellow";
  return "green";
}

async function emailHrTargetHoursRequest(
  va: { name: string; email: string },
  newTarget: number,
  notes: string | undefined,
): Promise<void> {
  const settings = await loadSettings();
  const to = settingStr(settings, "hr_manager_email") || settingStr(settings, "team_lead_email");
  if (!to) return;

  const from =
    settingStr(settings, "system_email_from") ||
    settingStr(settings, "system_email_reply_to") ||
    to;

  await sendSystemEmail({
    from,
    to,
    subject: `Target hours request: ${va.name}`,
    body: [
      `${va.name} (${va.email}) requested a target-hours change.`,
      "",
      `Requested target hours: ${newTarget}`,
      "",
      `Notes: ${notes || "(none)"}`,
    ].join("\n"),
  });
}
