import { drive as driveApi } from "@googleapis/drive";
import { GoogleAuth } from "google-auth-library";
import { Readable } from "node:stream";
import { env } from "@/lib/env";
import { sendSystemEmail } from "@/lib/email";

export type DeliveryResult = { pdfDriveFileId?: string; pdfWebViewLink?: string };

async function driveClient() {
  const creds = env.GOOGLE_SERVICE_ACCOUNT_FILE
    ? JSON.parse(await (await import("fs/promises")).readFile(env.GOOGLE_SERVICE_ACCOUNT_FILE, "utf8"))
    : JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "{}");
  const auth = new GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/drive.file"] });
  return driveApi({ version: "v3", auth });
}

/** Best-effort: never throws. Uploads to Drive (if folder configured) + emails the PDF. */
export async function deliverSignedContract(args: {
  pdf: Buffer;
  candidateName: string;
  candidateEmail: string;
  hrRecipients: string[];
  from: string;
  folderId: string;
  dateYmd: string;
}): Promise<DeliveryResult> {
  const result: DeliveryResult = {};
  const filename = `Contract - ${args.candidateName} - ${args.dateYmd}.pdf`;

  if (args.folderId) {
    try {
      const drive = await driveClient();
      const created = await drive.files.create({
        requestBody: { name: filename, parents: [args.folderId] },
        media: { mimeType: "application/pdf", body: Readable.from(args.pdf) },
        fields: "id, webViewLink",
        supportsAllDrives: true,
      });
      result.pdfDriveFileId = created.data.id ?? undefined;
      result.pdfWebViewLink = created.data.webViewLink ?? undefined;
    } catch (err) {
      console.warn("deliverSignedContract: Drive upload failed:", err instanceof Error ? err.message : err);
    }
  }

  const recipients = [args.candidateEmail, ...args.hrRecipients].filter(Boolean);
  try {
    await sendSystemEmail({
      from: args.from,
      to: recipients,
      subject: "Your signed Pure Water VA contract",
      body: `Hi ${args.candidateName},\n\nThanks for signing. Your signed contract is attached for your records.\n\n— Pure Water Automations`,
      attachments: [{ filename, content: args.pdf, mimeType: "application/pdf" }],
    });
  } catch (err) {
    console.warn("deliverSignedContract: email failed:", err instanceof Error ? err.message : err);
  }

  return result;
}
