import { createHash, randomUUID } from "node:crypto";
import type { DealStage } from "@prisma/client";
import { db } from "@/lib/db";
import { loadSettings, num as settingNum } from "@/lib/settings";
import { logActivity } from "@/lib/activity";
import { sendSystemEmail } from "@/lib/email";
import { runWithActor } from "@/lib/request-context";
import { generateSignedPdf } from "@/lib/contract/pdf";
import { deliverSignedDocument } from "@/lib/contract/store";
import {
  DEFAULT_CLIENT_AGREEMENT_TEMPLATE_HTML,
  agreementVarsForDeal,
  renderAgreement,
} from "@/lib/sales/client-template";
import { appBaseUrl, systemEmailFrom, teamRecipients, companyName, firstName, addDays } from "@/lib/sales/util";
import { onAgreementSigned } from "@/lib/sales/payment";
import { maybeConvertDeal, setDealStage } from "@/lib/sales/deal";

/**
 * Pre-proposal stages a deal can auto-advance FROM when its agreement is sent.
 * Sending the agreement IS the proposal going out, so these move to
 * `proposal_sent`. Excludes stages at or past `proposal_sent`
 * (`proposal_sent`/`negotiation`/`verbal_yes`/`won`) so a resend never drags a
 * deal backward, and `lost` (a closed-lost deal reopens by a deliberate move).
 */
const PRE_PROPOSAL_STAGES: readonly DealStage[] = [
  "new",
  "discovery_scheduled",
  "discovery_completed",
  "proposal_needed",
  "nurture",
  "no_show",
];

/** Whether sending the agreement should advance this stage to `proposal_sent`. */
export function shouldAdvanceToProposalSent(stage: DealStage): boolean {
  return PRE_PROPOSAL_STAGES.includes(stage);
}

function templateHtml(settings: Map<string, string>): string {
  return settings.get("client_agreement_template_html")?.trim() || DEFAULT_CLIENT_AGREEMENT_TEMPLATE_HTML;
}

type SignableAgreement = { status: string; deadline: Date | null; signedAt: Date | null };

/** Throws a friendly error if the agreement can't be signed right now. */
export function assertAgreementSignable(a: SignableAgreement): void {
  if (a.signedAt || (a.status !== "sent" && a.status !== "viewed")) {
    throw new Error("This agreement has already been signed or is not awaiting signature.");
  }
  if (a.deadline && a.deadline.getTime() < Date.now()) {
    throw new Error("This signing link has expired. Please contact Pure Water Automations.");
  }
}

/**
 * Create/refresh the signing link for a deal's service agreement and email it to
 * the client contact. Mirrors recruitment.markContractSent.
 */
export async function sendClientAgreement(dealId: string) {
  const deal = await db.deal.findUnique({ where: { id: dealId }, include: { agreement: true } });
  if (!deal) throw new Error("Deal not found.");
  if (!deal.contactEmail?.trim()) throw new Error("Deal has no contact email to send the agreement to.");

  const settings = await loadSettings();
  const deadlineDays = Math.max(0, Math.trunc(settingNum(settings, "client_agreement_deadline_days", 14)));
  const now = new Date();
  const token = randomUUID();
  const deadline = addDays(now, deadlineDays);

  const agreement = await db.clientAgreement.upsert({
    where: { dealId },
    update: { signToken: token, status: "sent", sentAt: now, deadline, signerEmail: deal.contactEmail },
    create: {
      dealId,
      signToken: token,
      status: "sent",
      sentAt: now,
      deadline,
      signerEmail: deal.contactEmail,
      packageName: deal.packageName,
      billingType: deal.billingType,
    },
  });

  const company = companyName(settings);
  const link = `${appBaseUrl(settings)}/sign/${token}`;
  await runWithActor(deal.contactEmail, () =>
    sendSystemEmail({
      from: systemEmailFrom(settings),
      to: deal.contactEmail!,
      subject: `Your ${company} service agreement`,
      body: [
        `Hi ${firstName(deal.contactName) || "there"},`,
        "",
        `This is the team at ${company} — thank you for choosing to work with us! Your service agreement is ready to review and sign:`,
        "",
        link,
        "",
        "Read it, type your name, sign, and submit — it takes about a minute. Once it's signed and your first payment is in, we'll kick off onboarding right away.",
        "",
        "Questions? Just reply to this email — we read every one.",
        "",
        "With you in the mission,",
        `The ${company} team`,
        "https://purewaterautomations.com",
      ].join("\n"),
    }),
  ).catch((err) => console.warn("sendClientAgreement: email failed:", err instanceof Error ? err.message : err));

  await db.deal.update({ where: { id: dealId }, data: { lastContactAt: now } });
  await logActivity({ source: "sales", eventType: "agreement_sent", summary: `Service agreement sent to ${deal.orgName}` });

  // Sending the agreement IS the proposal going out — advance the funnel so the
  // card doesn't sit in discovery_completed while its agreement is live. Never
  // drags a deal backward from negotiation/verbal_yes/won on a resend.
  if (shouldAdvanceToProposalSent(deal.stage)) {
    await setDealStage(dealId, "proposal_sent").catch((err) =>
      console.warn("sendClientAgreement: stage advance failed:", err instanceof Error ? err.message : err),
    );
  }
  return agreement;
}

export type AgreementPreview = {
  ok: true;
  alreadySent: boolean;
  summary: {
    client: string;
    contact: string;
    email: string;
    package: string;
    price: string;
    billing: string;
    startDate: string;
    deadline: string;
    company: string;
  };
  contractHtml: string;
};

/**
 * Render exactly what `sendClientAgreement` would send the client — the deal
 * summary plus the full contract HTML — without creating a token, emailing, or
 * touching the deal. Backs the "review before send" confirmation step.
 */
export async function getAgreementPreview(dealId: string): Promise<AgreementPreview> {
  const deal = await db.deal.findUnique({ where: { id: dealId }, include: { agreement: true } });
  if (!deal) throw new Error("Deal not found.");

  const settings = await loadSettings();
  const deadlineDays = Math.max(0, Math.trunc(settingNum(settings, "client_agreement_deadline_days", 14)));
  const now = new Date();
  // Use the live deadline if an agreement exists, else the deadline a fresh send would set.
  const previewDeadline = deal.agreement?.deadline ?? addDays(now, deadlineDays);
  const vars = agreementVarsForDeal(
    deal,
    {
      packageName: deal.agreement?.packageName ?? null,
      priceLabel: deal.agreement?.priceLabel ?? null,
      billingType: deal.agreement?.billingType ?? null,
      deadline: previewDeadline,
    },
    settings,
    now,
  );

  return {
    ok: true as const,
    alreadySent: !!deal.agreement?.sentAt,
    summary: {
      client: vars.client,
      contact: vars.contact,
      email: deal.contactEmail?.trim() || "",
      package: vars.package,
      price: vars.price,
      billing: vars.billing,
      startDate: vars.start_date,
      deadline: vars.deadline,
      company: vars.company,
    },
    contractHtml: renderAgreement(templateHtml(settings), vars),
  };
}

/** Public read for the sign page (same shape the candidate signer returns). */
export async function getAgreementSignState(token: string) {
  const agreement = await db.clientAgreement.findUnique({ where: { signToken: token }, include: { deal: true } });
  if (!agreement) return null;

  const settings = await loadSettings();
  const now = new Date();
  const vars = agreementVarsForDeal(agreement.deal, agreement, settings, now);
  const html = renderAgreement(templateHtml(settings), vars);
  const alreadySigned = !!agreement.signedAt || (agreement.status !== "sent" && agreement.status !== "viewed");
  const expired = !!agreement.deadline && agreement.deadline.getTime() < now.getTime();

  return {
    ok: true as const,
    name: vars.contact || vars.client,
    company: vars.company,
    deadline: vars.deadline,
    contractHtml: html,
    alreadySigned,
    expired,
  };
}

export type AgreementSignInput = { signerName: string; signatureImage: string | null; agree: boolean };

/** Public signing action for a client agreement. */
export async function signClientAgreement(
  token: string,
  input: AgreementSignInput,
  meta: { ip: string | null; userAgent: string | null },
) {
  if (!input.agree) throw new Error("Please confirm you have read and agree to the agreement.");
  if (!input.signerName?.trim()) throw new Error("Please type your full legal name.");

  const agreement = await db.clientAgreement.findUnique({ where: { signToken: token }, include: { deal: true } });
  if (!agreement) throw new Error("This signing link is not valid.");
  assertAgreementSignable(agreement);

  const now = new Date();
  const settings = await loadSettings();
  const vars = agreementVarsForDeal(agreement.deal, agreement, settings, now);
  const html = renderAgreement(templateHtml(settings), vars);
  const termsHash = createHash("sha256").update(html).digest("hex");

  const pdf = await generateSignedPdf({
    contentHtml: html,
    signerName: input.signerName.trim(),
    signatureImage: input.signatureImage,
    audit: {
      signedAt: now.toISOString(),
      signerIp: meta.ip,
      userAgent: meta.userAgent,
      templateHash: termsHash,
      subjectId: agreement.dealId,
      subjectLabel: "client",
    },
  });

  const signerEmail = agreement.signerEmail || agreement.deal.contactEmail || "";
  const delivery = await runWithActor(signerEmail, () =>
    deliverSignedDocument({
      pdf,
      filename: `Service Agreement - ${vars.client} - ${vars.date}.pdf`,
      signerName: input.signerName.trim(),
      signerEmail,
      ccRecipients: teamRecipients(settings),
      from: systemEmailFrom(settings),
      folderId: (settings.get("signed_client_contracts_folder_id") ?? "").trim(),
      subject: `Your signed ${vars.company} service agreement`,
      body: [
        `Hi ${firstName(vars.contact) || "there"},`,
        "",
        `Thank you — your signed service agreement with ${vars.company} is attached for your records. We're so glad to have you with us, and we'll be in touch shortly to kick off onboarding.`,
        "",
        "If anything comes up, just reply to this email.",
        "",
        "With you in the mission,",
        `The ${vars.company} team`,
        "https://purewaterautomations.com",
      ].join("\n"),
    }),
  );

  await db.clientAgreement.update({
    where: { id: agreement.id },
    data: {
      status: "signed",
      signedAt: now,
      signerName: input.signerName.trim(),
      signerEmail,
      signerIp: meta.ip,
      userAgent: meta.userAgent,
      signatureImage: input.signatureImage,
      termsHash,
      pdfDriveFileId: delivery.pdfDriveFileId,
      pdfWebViewLink: delivery.pdfWebViewLink,
      signToken: null, // single-use
    },
  });

  await logActivity({
    source: "sales",
    eventType: "agreement_signed_in_app",
    severity: "success",
    summary: `${vars.client} signed their service agreement online`,
  });

  // Kick off payment (best-effort) and advance the deal if already paid.
  await onAgreementSigned(agreement.dealId).catch((err) =>
    console.warn("signClientAgreement: payment kickoff failed:", err instanceof Error ? err.message : err),
  );
  await maybeConvertDeal(agreement.dealId).catch(() => {});

  return { ok: true as const };
}

/** Admin: persist an edited client agreement template. */
export async function saveClientAgreementTemplate(html: string): Promise<{ ok: true }> {
  const value = (html ?? "").trim();
  if (!value) throw new Error("Template cannot be empty.");
  await db.setting.upsert({
    where: { key: "client_agreement_template_html" },
    update: { value },
    create: { key: "client_agreement_template_html", value },
  });
  return { ok: true };
}
