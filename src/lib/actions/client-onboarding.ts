import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { sendSystemEmail } from "@/lib/email";
import { loadSettings } from "@/lib/settings";
import { runWithActor } from "@/lib/request-context";
import { appBaseUrl, systemEmailFrom, companyName, firstName } from "@/lib/sales/util";
import { ONBOARDING_BOOLEAN_FIELDS, isOnboardingChecklistComplete } from "@/lib/sales/onboarding-checklist";

export { ONBOARDING_BOOLEAN_FIELDS, isOnboardingChecklistComplete };

const BOOLEAN_SET = new Set<string>(ONBOARDING_BOOLEAN_FIELDS);
const TEXT_FIELDS = new Set(["owner", "notes"]);

function coerceBoolean(value: unknown, field: string): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(v)) return true;
    if (["false", "no", "0"].includes(v)) return false;
  }
  throw new Error(`${field} must be a boolean`);
}

export async function setOnboardingFlag(orgId: string, field: string, value: unknown, note?: string) {
  const row = await db.clientOnboarding.findUnique({ where: { clientOrganizationId: orgId } });
  if (!row) throw new Error(`No onboarding record for org ${orgId}`);

  const data: Prisma.ClientOnboardingUpdateInput = {};
  if (BOOLEAN_SET.has(field)) {
    (data as Record<string, unknown>)[field] = coerceBoolean(value, field);
  } else if (TEXT_FIELDS.has(field)) {
    (data as Record<string, unknown>)[field] = typeof value === "string" ? value.trim() || null : null;
  } else {
    throw new Error(`Field not allowed: ${field}`);
  }
  if (row.status === "pending") data.status = "in_progress";
  if (note?.trim() && field !== "notes") data.notes = note.trim();

  const updated = await db.clientOnboarding.update({ where: { clientOrganizationId: orgId }, data });
  await logActivity({ source: "client_onboarding", eventType: "onboarding_flag", summary: `Org ${orgId} onboarding: ${field} = ${String(value)}` });
  return updated;
}

/**
 * Complete client onboarding: activate the org, provision portal access for the
 * deal contact (CLIENT_ADMIN), send a portal welcome, and close the record.
 */
export async function markClientOnboardingComplete(orgId: string) {
  const row = await db.clientOnboarding.findUnique({ where: { clientOrganizationId: orgId } });
  if (!row) throw new Error(`No onboarding record for org ${orgId}`);

  const org = await db.clientOrganization.findUnique({ where: { id: orgId } });
  if (!org) throw new Error("Client organization not found.");

  // Provision portal access for the deal's primary contact (best-effort).
  const deal = await db.deal.findFirst({ where: { clientOrgId: orgId } });
  const settings = await loadSettings();
  let grantedEmail: string | null = null;
  if (deal?.contactEmail) {
    const email = deal.contactEmail.trim().toLowerCase();
    const user = await db.user.upsert({
      where: { email },
      update: { active: true },
      create: { email, name: deal.contactName ?? null, role: "CLIENT_ADMIN", active: true },
    });
    await db.clientMembership.upsert({
      where: { userId_clientOrganizationId: { userId: user.id, clientOrganizationId: orgId } },
      update: {},
      create: { userId: user.id, clientOrganizationId: orgId },
    });
    grantedEmail = email;
  }

  await db.clientOnboarding.update({
    where: { clientOrganizationId: orgId },
    data: { status: "completed", portalAccessGranted: grantedEmail ? true : row.portalAccessGranted },
  });
  await db.clientOrganization.update({ where: { id: orgId }, data: { status: "active" } });

  if (grantedEmail) {
    await runWithActor(grantedEmail, () =>
      sendSystemEmail({
        from: systemEmailFrom(settings),
        to: grantedEmail!,
        subject: `Welcome to ${companyName(settings)} — your client portal`,
        body: [
          `Hi ${firstName(deal?.contactName) || "there"},`,
          "",
          `Onboarding is complete and your ${org.name} workspace is live.`,
          "",
          `Sign in to your client portal to track work, submit requests, and message the team:`,
          `${appBaseUrl(settings)}/client`,
          "",
          `— ${companyName(settings)}`,
        ].join("\n"),
      }),
    ).catch((err) => console.warn("markClientOnboardingComplete: welcome failed:", err instanceof Error ? err.message : err));
  }

  await logActivity({
    source: "client_onboarding",
    eventType: "onboarding_complete",
    severity: "success",
    summary: `${org.name} onboarding complete — org active${grantedEmail ? `, portal access granted to ${grantedEmail}` : ""}`,
  });

  return { ok: true as const };
}

/** Create/refresh the public intake-form link and email it to the client contact. */
export async function sendIntakeForm(orgId: string) {
  const row = await db.clientOnboarding.findUnique({ where: { clientOrganizationId: orgId } });
  if (!row) throw new Error(`No onboarding record for org ${orgId}`);
  const org = await db.clientOrganization.findUnique({ where: { id: orgId } });
  const deal = await db.deal.findFirst({ where: { clientOrgId: orgId } });
  if (!deal?.contactEmail) throw new Error("No client contact email to send the intake form to.");

  const token = row.intakeToken ?? randomUUID();
  await db.clientOnboarding.update({ where: { clientOrganizationId: orgId }, data: { intakeToken: token } });

  const settings = await loadSettings();
  const link = `${appBaseUrl(settings)}/intake/${token}`;
  await runWithActor(deal.contactEmail, () =>
    sendSystemEmail({
      from: systemEmailFrom(settings),
      to: deal.contactEmail!,
      subject: `${companyName(settings)} — quick onboarding intake form`,
      body: [
        `Hi ${firstName(deal.contactName) || "there"},`,
        "",
        `Welcome aboard! To get ${org?.name ?? "your account"} set up, please complete this short intake form:`,
        "",
        link,
        "",
        "It takes a few minutes and helps us prioritize the right work from day one.",
        "",
        `— ${companyName(settings)}`,
      ].join("\n"),
    }),
  ).catch((err) => console.warn("sendIntakeForm: email failed:", err instanceof Error ? err.message : err));

  await logActivity({ source: "client_onboarding", eventType: "intake_sent", summary: `Intake form sent for ${org?.name ?? orgId}` });
  return { ok: true as const, token };
}

/** Public read for the intake page. */
export async function getIntakeState(token: string) {
  const row = await db.clientOnboarding.findUnique({ where: { intakeToken: token } });
  if (!row) return { ok: false as const, error: "This intake link is not valid." };
  const org = await db.clientOrganization.findUnique({ where: { id: row.clientOrganizationId } });
  const settings = await loadSettings();
  return {
    ok: true as const,
    orgName: org?.name ?? "your account",
    company: companyName(settings),
    alreadySubmitted: row.intakeReceived,
  };
}

export const INTAKE_FIELDS = [
  "primaryContact",
  "priorityTasks",
  "toolsUsed",
  "commsPreferences",
  "stakeholders",
  "additionalNotes",
] as const;

/** Public submit for the intake form. Records answers + flags intake received. */
export async function submitIntake(token: string, answers: Record<string, unknown>) {
  const row = await db.clientOnboarding.findUnique({ where: { intakeToken: token } });
  if (!row) throw new Error("This intake link is not valid.");
  if (row.intakeReceived) return { ok: true as const }; // idempotent

  const clean: Record<string, string> = {};
  for (const f of INTAKE_FIELDS) {
    const v = answers[f];
    if (typeof v === "string" && v.trim()) clean[f] = v.trim();
  }

  await db.clientOnboarding.update({
    where: { intakeToken: token },
    data: {
      intakeJson: clean,
      intakeReceived: true,
      intakeReceivedAt: new Date(),
      status: row.status === "pending" ? "in_progress" : row.status,
    },
  });

  const org = await db.clientOrganization.findUnique({ where: { id: row.clientOrganizationId } });
  await logActivity({ source: "client_onboarding", eventType: "intake_received", severity: "success", summary: `Intake received for ${org?.name ?? row.clientOrganizationId}` });

  // Notify the onboarding owner (best-effort).
  if (row.owner) {
    const settings = await loadSettings();
    await sendSystemEmail({
      from: systemEmailFrom(settings),
      to: row.owner,
      subject: `Intake submitted: ${org?.name ?? "client"}`,
      body: `${org?.name ?? "A client"} just submitted their onboarding intake form. Review it in the console.`,
    }).catch(() => {});
  }

  return { ok: true as const };
}
