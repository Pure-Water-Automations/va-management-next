import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { loadSettings } from "@/lib/settings";
import { renderContract, contractVarsForCandidate } from "@/lib/contract/template";
import { DEFAULT_CONTRACT_TEMPLATE_HTML } from "@/lib/contract/seed-template";
import { generateSignedPdf } from "@/lib/contract/pdf";
import { deliverSignedContract } from "@/lib/contract/store";
import { markContractSigned } from "@/lib/actions/recruitment";
import { logActivity } from "@/lib/activity";
import { runWithActor } from "@/lib/request-context";

type Signable = { currentStage: string; contractDeadline: Date | null; signedAt: Date | null };

/** Throws a friendly error if the contract can't be signed right now. */
export function assertSignable(c: Signable): void {
  if (c.signedAt || c.currentStage !== "contract_sent") {
    throw new Error("This contract has already been signed or is not awaiting signature.");
  }
  if (c.contractDeadline && c.contractDeadline.getTime() < Date.now()) {
    throw new Error("This signing link has expired. Please contact Pure Water Automations.");
  }
}

async function templateHtml(settings: Map<string, string>): Promise<string> {
  return settings.get("contract_template_html")?.trim() || DEFAULT_CONTRACT_TEMPLATE_HTML;
}

/** Public read for the sign page. Returns the rendered contract + display state. */
export async function getSignState(token: string) {
  const candidate = await db.candidate.findUnique({ where: { contractSignToken: token } });
  if (!candidate) return { ok: false as const, error: "This signing link is not valid." };

  const alreadySigned = candidate.currentStage !== "contract_sent" || !!candidate.signedAt;
  const expired = !!candidate.contractDeadline && candidate.contractDeadline.getTime() < Date.now();

  const settings = await loadSettings();
  const trainee = await db.compensationRole.findUnique({ where: { roleId: "TRAINEE" } });
  const vars = contractVarsForCandidate(candidate, trainee, settings, new Date());
  const html = renderContract(await templateHtml(settings), vars);

  return {
    ok: true as const,
    name: vars.name,
    company: vars.company,
    deadline: vars.deadline,
    contractHtml: html,
    alreadySigned,
    expired,
  };
}

export type SignInput = { signerName: string; signatureImage: string | null; agree: boolean };

/** Public signing action. Records the signature, delivers the PDF, provisions the VA. */
export async function signContract(
  token: string,
  input: SignInput,
  meta: { ip: string | null; userAgent: string | null },
) {
  if (!input.agree) throw new Error("Please confirm you have read and agree to the contract.");
  if (!input.signerName?.trim()) throw new Error("Please type your full legal name.");

  const candidate = await db.candidate.findUnique({ where: { contractSignToken: token } });
  if (!candidate) throw new Error("This signing link is not valid.");
  assertSignable(candidate);

  const now = new Date();
  const settings = await loadSettings();
  const trainee = await db.compensationRole.findUnique({ where: { roleId: "TRAINEE" } });
  const vars = contractVarsForCandidate(candidate, trainee, settings, now);
  const html = renderContract(await templateHtml(settings), vars);
  const templateHash = createHash("sha256").update(html).digest("hex");

  const pdf = await generateSignedPdf({
    contentHtml: html,
    signerName: input.signerName.trim(),
    signatureImage: input.signatureImage,
    audit: {
      signedAt: now.toISOString(),
      signerIp: meta.ip,
      userAgent: meta.userAgent,
      templateHash,
      candidateId: candidate.candidateId,
    },
  });

  const from =
    settings.get("system_email_from")?.trim() ||
    settings.get("hr_manager_email")?.trim() ||
    "okamotomiak@gmail.com";
  const hrRecipients = [settings.get("hr_manager_email"), settings.get("people_ops_email")]
    .map((v) => (v ?? "").trim())
    .filter(Boolean) as string[];

  // Sign-flow emails (signed PDF, onboarding/welcome) route to the signer in test
  // mode, so a tester playing the candidate receives them.
  const delivery = await runWithActor(candidate.email, () =>
    deliverSignedContract({
      pdf,
      candidateName: vars.name,
      candidateEmail: candidate.email,
      hrRecipients,
      from,
      folderId: (settings.get("signed_contracts_folder_id") ?? "").trim(),
      dateYmd: vars.date,
    }),
  );

  await db.contractSignature.create({
    data: {
      candidateId: candidate.candidateId,
      signerName: input.signerName.trim(),
      signerEmail: candidate.email,
      signedAt: now,
      signerIp: meta.ip,
      userAgent: meta.userAgent,
      signatureImage: input.signatureImage,
      templateHash,
      pdfDriveFileId: delivery.pdfDriveFileId,
      pdfWebViewLink: delivery.pdfWebViewLink,
    },
  });

  // Provision the VA (reuses the existing flow; passes its contract_sent guard here).
  await runWithActor(candidate.email, () => markContractSigned(candidate.candidateId));

  // Consume the token so the link can't be reused.
  await db.candidate.update({
    where: { candidateId: candidate.candidateId },
    data: { contractSignToken: null },
  });

  await logActivity({
    source: "recruitment",
    eventType: "contract_signed_in_app",
    severity: "success",
    summary: `${vars.name} signed their contract online`,
  });

  return { ok: true as const };
}

export async function saveContractTemplate(html: string): Promise<{ ok: true }> {
  const value = (html ?? "").trim();
  if (!value) throw new Error("Template cannot be empty.");
  await db.setting.upsert({ where: { key: "contract_template_html" }, update: { value }, create: { key: "contract_template_html", value } });
  return { ok: true };
}
