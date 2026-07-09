import type { CompRole, CompensationType, VaStatus } from "@prisma/client";
import { logActivity } from "@/lib/activity";
import { db } from "@/lib/db";
import { sendSystemEmail, type SystemEmailResult } from "@/lib/email";

export type SaveVaInput = {
  vaId?: string;
  name: string;
  email: string;
  compensationRole?: CompRole;
  status?: VaStatus;
  targetHoursWeekly?: number;
  supervisorVaId?: string | null;
  desklogUserId?: string | null;
  skillSpecs?: string | null;
  availabilityNotes?: string | null;
  lastCheckinDate?: Date | null;
  notionProfileUrl?: string | null;
  notionDisplayTier?: string | null;
  tierMismatchFlag?: string | null;
};

export type SaveRoleInput = {
  roleId: CompRole;
  roleName?: string;
  compensationType?: CompensationType;
  hourlyRate?: number | null;
  salaryPerPeriod?: number | null;
  onAdvancementTrack?: boolean;
  minTotalHoursToReachNext?: number | null;
  nextRoleId?: CompRole | null;
  additionalRequirements?: string | null;
  notes?: string | null;
};

const COMP_ROLES: readonly CompRole[] = ["TRAINEE", "TIER_1", "TIER_2", "TIER_3", "TIER_4"];
const VA_STATUSES: readonly VaStatus[] = ["active", "training", "departed"];
const COMPENSATION_TYPES: readonly CompensationType[] = ["hourly", "salary"];

export function normalizeCompRole(value: string, fieldName = "compensationRole"): CompRole {
  let normalized = upperSnake(value);
  if (normalized === "TRAINING") normalized = "TRAINEE";
  normalized = normalized.replace(/^TIER([1-4])$/, "TIER_$1");
  if (isOneOf(normalized, COMP_ROLES)) return normalized;
  throw new Error(`Invalid ${fieldName}: ${value}`);
}

export function normalizeVaStatus(value: string, fieldName = "status"): VaStatus {
  const normalized = lowerSnake(value);
  if (normalized === "trainee" || normalized === "onboarding") return "training";
  if (normalized === "inactive" || normalized === "left" || normalized === "terminated") {
    return "departed";
  }
  if (isOneOf(normalized, VA_STATUSES)) return normalized;
  throw new Error(`Invalid ${fieldName}: ${value}`);
}

export function normalizeCompensationType(
  value: string,
  fieldName = "compensationType",
): CompensationType {
  const normalized = lowerSnake(value);
  if (isOneOf(normalized, COMPENSATION_TYPES)) return normalized;
  throw new Error(`Invalid ${fieldName}: ${value}`);
}

export async function saveVa(input: SaveVaInput, actorEmail: string) {
  const vaId = cleanText(input.vaId) ?? (await nextVaId());
  const name = requireText(input.name, "name");
  const email = requireText(input.email, "email").toLowerCase();
  const supervisorVaId =
    input.supervisorVaId === undefined ? undefined : cleanNullableText(input.supervisorVaId);
  const targetHoursWeekly = cleanOptionalNumber(input.targetHoursWeekly, "targetHoursWeekly");

  if (supervisorVaId === vaId) {
    throw new Error("A VA cannot be their own supervisor.");
  }
  if (supervisorVaId) {
    const supervisor = await db.va.findUnique({ where: { vaId: supervisorVaId }, select: { vaId: true } });
    if (!supervisor) throw new Error(`Supervisor VA not found: ${supervisorVaId}`);
  }

  const existing = await db.va.findUnique({ where: { vaId }, select: { vaId: true } });
  const va = existing
    ? await db.va.update({
        where: { vaId },
        data: {
          name,
          email,
          compensationRole: input.compensationRole,
          status: input.status,
          targetHoursWeekly,
          supervisorVaId,
          desklogUserId: optionalNullableText(input.desklogUserId),
          skillSpecs: optionalNullableText(input.skillSpecs),
          availabilityNotes: optionalNullableText(input.availabilityNotes),
          lastCheckinDate: input.lastCheckinDate,
          notionProfileUrl: optionalNullableText(input.notionProfileUrl),
          notionDisplayTier: optionalNullableText(input.notionDisplayTier),
          tierMismatchFlag: optionalNullableText(input.tierMismatchFlag),
        },
      })
    : await db.va.create({
        data: {
          vaId,
          name,
          email,
          compensationRole: input.compensationRole ?? "TRAINEE",
          status: input.status ?? "active",
          targetHoursWeekly: targetHoursWeekly ?? (await defaultTargetHoursWeekly()),
          supervisorVaId: supervisorVaId ?? null,
          desklogUserId: cleanNullableText(input.desklogUserId),
          skillSpecs: cleanNullableText(input.skillSpecs),
          availabilityNotes: cleanNullableText(input.availabilityNotes),
          lastCheckinDate: input.lastCheckinDate ?? null,
          notionProfileUrl: cleanNullableText(input.notionProfileUrl),
          notionDisplayTier: cleanNullableText(input.notionDisplayTier),
          tierMismatchFlag: cleanNullableText(input.tierMismatchFlag),
          roleStartedDate: new Date(),
        },
      });

  await logActivity({
    source: "hr_action",
    eventType: "va_saved",
    vaId,
    severity: "success",
    summary: `VA record saved for ${va.name} by ${actorEmail}`,
  });
  return va;
}

export async function deactivateVa(vaId: string, notes: string | undefined, actorEmail: string) {
  const id = requireText(vaId, "vaId");
  const va = await db.va.findUnique({ where: { vaId: id } });
  if (!va) throw new Error(`VA not found: ${id}`);

  const updated = await db.va.update({
    where: { vaId: id },
    data: {
      status: "departed",
      availabilityNotes: cleanText(notes) ?? va.availabilityNotes,
    },
  });

  await logActivity({
    source: "hr_action",
    eventType: "va_deactivated",
    vaId: id,
    severity: "warning",
    summary: `${va.name} marked departed by ${actorEmail}.`,
  });
  return updated;
}

export async function saveRole(input: SaveRoleInput, actorEmail: string) {
  const roleName = cleanText(input.roleName) ?? input.roleId;
  const hourlyRate = cleanOptionalNullableNumber(input.hourlyRate, "hourlyRate");
  const salaryPerPeriod = cleanOptionalNullableNumber(input.salaryPerPeriod, "salaryPerPeriod");
  const minTotalHoursToReachNext = cleanOptionalNullableNumber(
    input.minTotalHoursToReachNext,
    "minTotalHoursToReachNext",
  );

  const role = await db.compensationRole.upsert({
    where: { roleId: input.roleId },
    update: {
      roleName,
      compensationType: input.compensationType ?? "hourly",
      hourlyRate,
      salaryPerPeriod,
      onAdvancementTrack: input.onAdvancementTrack ?? true,
      minTotalHoursToReachNext,
      nextRoleId: input.nextRoleId ?? null,
      additionalRequirements: cleanNullableText(input.additionalRequirements),
      notes: cleanNullableText(input.notes),
    },
    create: {
      roleId: input.roleId,
      roleName,
      compensationType: input.compensationType ?? "hourly",
      hourlyRate,
      salaryPerPeriod,
      onAdvancementTrack: input.onAdvancementTrack ?? true,
      minTotalHoursToReachNext,
      nextRoleId: input.nextRoleId ?? null,
      additionalRequirements: cleanNullableText(input.additionalRequirements),
      notes: cleanNullableText(input.notes),
    },
  });

  await logActivity({
    source: "hr_action",
    eventType: "role_saved",
    severity: "success",
    summary: `Compensation role saved: ${input.roleId} by ${actorEmail}`,
  });
  return role;
}

export async function setRoleDelegation(
  actorEmail: string,
  input: { roleId: CompRole; canDelegateTasks?: boolean; canDelegateProjects?: boolean },
) {
  const roleId = normalizeCompRole(input.roleId, "roleId");
  const data: { canDelegateTasks?: boolean; canDelegateProjects?: boolean } = {};
  if (input.canDelegateTasks !== undefined) data.canDelegateTasks = input.canDelegateTasks;
  if (input.canDelegateProjects !== undefined) data.canDelegateProjects = input.canDelegateProjects;
  if (data.canDelegateTasks === undefined && data.canDelegateProjects === undefined) {
    throw new Error("No delegation flags provided.");
  }

  const role = await db.compensationRole.update({ where: { roleId }, data });

  await logActivity({
    source: "hr_action",
    eventType: "role_delegation_set",
    severity: "info",
    summary: `Delegation authority for ${roleId} updated (tasks=${role.canDelegateTasks}, projects=${role.canDelegateProjects}) by ${actorEmail}`,
  });
  return role;
}

export async function approveTierReview(
  reviewId: string,
  vaId: string,
  targetRole: CompRole,
  actorEmail: string,
) {
  const id = requireText(reviewId, "reviewId");
  const targetVaId = requireText(vaId, "vaId");
  const bookkeeperEmail = await getSettingValue("bookkeeper_email");
  const fromEmail = bookkeeperEmail ? await requireSettingValue("system_email_from") : null;
  const now = new Date();

  const result = await db.$transaction(async (tx) => {
    const review = await tx.tierReview.findUnique({ where: { id } });
    if (!review) throw new Error(`Tier review not found: ${id}`);
    if (review.vaId !== targetVaId) {
      throw new Error(`Tier review ${id} does not belong to VA ${targetVaId}`);
    }

    const va = await tx.va.findUnique({ where: { vaId: targetVaId } });
    if (!va) throw new Error(`VA not found: ${targetVaId}`);

    const role = await tx.compensationRole.findUnique({ where: { roleId: targetRole } });
    if (!role) throw new Error(`Role not found: ${targetRole}`);

    const updatedVa = await tx.va.update({
      where: { vaId: targetVaId },
      data: { compensationRole: targetRole, roleStartedDate: now },
    });
    const updatedReview = await tx.tierReview.update({
      where: { id },
      data: { status: "approved", hrDecisionDate: now, targetRole },
    });

    return { previousRole: va.compensationRole, role, va: updatedVa, review: updatedReview };
  });

  let email: SystemEmailResult | null = null;
  try {
    if (bookkeeperEmail && fromEmail) {
      email = await sendSystemEmail({
        from: fromEmail,
        to: bookkeeperEmail,
        subject: `Rate change: ${result.va.name} to ${result.role.roleName}`,
        body: `${result.va.name} approved for ${result.role.roleName}. New rate effective next pay period.`,
      });
    }
  } catch (err) {
    const message = errorMessage(err);
    await logActivity({
      source: "hr_action",
      eventType: "tier_approved",
      vaId: targetVaId,
      severity: "warning",
      summary: `${result.va.name} approved from ${result.previousRole} to ${targetRole} by ${actorEmail}. Bookkeeper email failed: ${message}`,
    });
    throw err;
  }

  await logActivity({
    source: "hr_action",
    eventType: "tier_approved",
    vaId: targetVaId,
    severity: "success",
    summary: `${result.va.name} approved from ${result.previousRole} to ${targetRole} by ${actorEmail}${emailSummary(email)}`,
  });
  return { ...result, email };
}

export async function declineTierReview(
  reviewId: string,
  notes: string | undefined,
  actorEmail: string,
) {
  const id = requireText(reviewId, "reviewId");
  const review = await db.tierReview.update({
    where: { id },
    data: {
      status: "declined",
      hrDecisionDate: new Date(),
      hrNotes: cleanText(notes) ?? "",
    },
  });

  await logActivity({
    source: "hr_action",
    eventType: "tier_declined",
    vaId: review.vaId,
    severity: "warning",
    summary: `Tier review declined by ${actorEmail}`,
  });
  return review;
}

export async function sendSkillAttestationForm(
  reviewId: string,
  vaId: string,
  actorEmail: string,
) {
  const id = requireText(reviewId, "reviewId");
  const targetVaId = requireText(vaId, "vaId");
  const [formUrl, fromEmail] = await Promise.all([
    requireSettingValue("skill_attestation_form_url"),
    requireSettingValue("system_email_from"),
  ]);

  const [review, va] = await Promise.all([
    db.tierReview.findUnique({ where: { id } }),
    db.va.findUnique({ where: { vaId: targetVaId } }),
  ]);
  if (!review) throw new Error(`Tier review not found: ${id}`);
  if (review.vaId !== targetVaId) {
    throw new Error(`Tier review ${id} does not belong to VA ${targetVaId}`);
  }
  if (!va) throw new Error(`VA not found: ${targetVaId}`);
  if (!va.email) throw new Error(`VA email not found: ${targetVaId}`);

  const email = await sendSystemEmail({
    from: fromEmail,
    to: va.email,
    subject: "Action needed: tier review skill attestation",
    body: `Hi ${firstName(va.name)},\n\nPlease fill out this form for your tier review:\n\n${formUrl}`,
  });

  const updatedReview = await db.tierReview.update({
    where: { id },
    data: { status: "form_sent", skillAttestationFormUrl: formUrl },
  });

  await logActivity({
    source: "hr_action",
    eventType: "skill_form_sent",
    vaId: targetVaId,
    severity: "info",
    summary: `Skill attestation form sent to ${va.name} by ${actorEmail}${emailSummary(email)}`,
  });
  return { review: updatedReview, email };
}

export async function resolveCapacityFlag(
  vaId: string,
  notes: string | undefined,
  actorEmail: string,
) {
  const targetVaId = requireText(vaId, "vaId");
  const va = await db.va.findUnique({ where: { vaId: targetVaId } });
  if (!va) throw new Error(`VA not found: ${targetVaId}`);

  const event = await db.capacityFlagEvent.create({
    data: {
      vaId: targetVaId,
      vaName: va.name,
      flagType: "manual_review",
      transition: "reviewed",
      severity: "green",
      supervisorVaId: va.supervisorVaId,
      notes: cleanText(notes) ?? null,
    },
  });

  await logActivity({
    source: "hr_action",
    eventType: "capacity_reviewed",
    vaId: targetVaId,
    severity: "success",
    summary: `Capacity flag reviewed for ${va.name} by ${actorEmail}`,
  });
  return event;
}

/** Carry-over cumulative hours from the old tool for one VA. */
export async function setVaBaseline(vaId: string, baselineHours: number, actorEmail: string) {
  const id = requireText(vaId, "vaId");
  if (!Number.isFinite(baselineHours) || baselineHours < 0) {
    throw new Error("Baseline hours must be a non-negative number.");
  }
  const va = await db.va.update({ where: { vaId: id }, data: { baselineHours } });
  await logActivity({
    source: "hr_action",
    eventType: "baseline_set",
    vaId: id,
    severity: "info",
    summary: `Baseline hours for ${va.name} set to ${baselineHours} by ${actorEmail}`,
  });
  return va;
}

/**
 * Change a VA's registry email. This is consequential, not cosmetic: the app
 * links a login to its VA profile by matching `Va.email` to `User.email`
 * (see auth/access.ts, auth/delegation.ts), and it's the address task,
 * evaluation, and onboarding notifications are sent to. So this must be the
 * VA's real working account — e.g. when someone was first registered under a
 * personal email but now logs in with their @purewaterautomations account.
 */
export async function setVaEmail(vaId: string, email: string, actorEmail: string) {
  const id = requireText(vaId, "vaId");
  const next = requireText(email, "email").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) throw new Error("Enter a valid email address.");
  const current = await db.va.findUnique({ where: { vaId: id }, select: { email: true, name: true } });
  if (!current) throw new Error("VA not found.");
  if (current.email.toLowerCase() === next) return { vaId: id, email: current.email };
  const clash = await db.va.findFirst({ where: { email: next, NOT: { vaId: id } }, select: { name: true } });
  if (clash) throw new Error(`That email already belongs to ${clash.name}.`);
  const va = await db.va.update({ where: { vaId: id }, data: { email: next } });
  await logActivity({
    source: "hr_action",
    eventType: "va_email_changed",
    vaId: id,
    severity: "info",
    summary: `Registry email for ${va.name} changed from ${current.email} to ${next} by ${actorEmail}`,
  });
  return { vaId: id, email: va.email };
}

/** Email TEST MODE — redirect ALL system mail to one address (empty = off). */
export async function setEmailTestRedirect(email: string | undefined, actorEmail: string) {
  const value = (email ?? "").trim();
  await db.setting.upsert({
    where: { key: "email_redirect_to" },
    update: { value },
    create: { key: "email_redirect_to", value },
  });
  await logActivity({
    source: "hr_action",
    eventType: "email_test_mode",
    severity: "warning",
    summary: value ? `Email TEST MODE ON — all mail redirected to ${value} by ${actorEmail}` : `Email test mode turned OFF by ${actorEmail}`,
  });
  return { ok: true, value };
}

/** Global cutover date — DeskLog hours before this don't count (baseline does). */
export async function setBaselineCutover(date: string | undefined, actorEmail: string) {
  const value = (date ?? "").trim();
  await db.setting.upsert({
    where: { key: "cumulative_baseline_date" },
    update: { value },
    create: { key: "cumulative_baseline_date", value },
  });
  await logActivity({
    source: "hr_action",
    eventType: "baseline_cutover_set",
    severity: "info",
    summary: `Cumulative baseline cutover date set to ${value || "(cleared)"} by ${actorEmail}`,
  });
  return { ok: true, date: value };
}

async function nextVaId(): Promise<string> {
  const rows = await db.va.findMany({ select: { vaId: true } });
  let max = 0;
  for (const row of rows) {
    const match = /^VA(\d+)$/.exec(row.vaId);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `VA${String(max + 1).padStart(3, "0")}`;
}

async function defaultTargetHoursWeekly(): Promise<number> {
  const value = await getSettingValue("default_target_hours_weekly");
  if (!value) return 30;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 30;
}

async function getSettingValue(key: string): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key }, select: { value: true } });
  return cleanText(row?.value) ?? null;
}

async function requireSettingValue(key: string): Promise<string> {
  const value = await getSettingValue(key);
  if (!value) throw new Error(`Missing Setting.${key}`);
  return value;
}

function requireText(value: string | undefined, fieldName: string): string {
  const text = cleanText(value);
  if (!text) throw new Error(`Missing field: ${fieldName}`);
  return text;
}

function cleanText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text ? text : undefined;
}

function cleanNullableText(value: string | null | undefined): string | null {
  return cleanText(value) ?? null;
}

function optionalNullableText(value: string | null | undefined): string | null | undefined {
  return value === undefined ? undefined : cleanNullableText(value);
}

function cleanOptionalNumber(value: number | undefined, fieldName: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value)) throw new Error(`Invalid ${fieldName}: ${value}`);
  return value;
}

function cleanOptionalNullableNumber(
  value: number | null | undefined,
  fieldName: string,
): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isFinite(value)) throw new Error(`Invalid ${fieldName}: ${value}`);
  return value;
}

function upperSnake(value: string): string {
  return value.trim().replace(/[\s-]+/g, "_").toUpperCase();
}

function lowerSnake(value: string): string {
  return value.trim().replace(/[\s-]+/g, "_").toLowerCase();
}

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
  return allowed.includes(value as T);
}

function firstName(name: string): string {
  return cleanText(name)?.split(/\s+/)[0] ?? "there";
}

function emailSummary(result: SystemEmailResult | null): string {
  if (!result || result.ok) return "";
  return ` Email skipped: ${result.reason}.`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
