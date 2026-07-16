/** Pure validation shared by the public discovery UI, API route, and tests. */

export const MAX_DISCOVERY_ATTACHMENTS = 3;
export const MAX_DISCOVERY_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const CONTENT_TYPES_BY_EXTENSION: Record<string, readonly string[]> = {
  pdf: ["application/pdf"],
  doc: ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  txt: ["text/plain"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
};

export type DiscoveryAttachmentInput = {
  name: string;
  size: number;
  type?: string;
};

export type ValidatedDiscoveryAttachment = {
  name: string;
  size: number;
  contentType: string;
};

export type DiscoveryAttachmentValidation =
  | { ok: true; files: ValidatedDiscoveryAttachment[] }
  | { ok: false; error: string };

export function validateDiscoveryAttachments(raw: unknown): DiscoveryAttachmentValidation {
  if (!Array.isArray(raw)) return { ok: false, error: "Invalid attachment list." };
  if (raw.length > MAX_DISCOVERY_ATTACHMENTS) {
    return { ok: false, error: `You can attach up to ${MAX_DISCOVERY_ATTACHMENTS} files.` };
  }

  const files: ValidatedDiscoveryAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: "Invalid attachment." };
    }
    const candidate = item as Record<string, unknown>;
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    const size = typeof candidate.size === "number" ? candidate.size : Number.NaN;
    const suppliedType = typeof candidate.type === "string"
      ? candidate.type.trim().toLowerCase().split(";", 1)[0]
      : "";

    if (!name || name.length > 180 || name.includes("\0")) {
      return { ok: false, error: "Each attachment needs a valid file name." };
    }
    if (!Number.isInteger(size) || size <= 0) {
      return { ok: false, error: `${name} is empty or has an invalid size.` };
    }
    if (size > MAX_DISCOVERY_ATTACHMENT_BYTES) {
      return { ok: false, error: `${name} is larger than 10 MB.` };
    }

    const extension = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
    const allowedTypes = CONTENT_TYPES_BY_EXTENSION[extension];
    if (!allowedTypes) {
      return { ok: false, error: `${name} must be a PDF, DOC, DOCX, TXT, PNG, or JPG file.` };
    }
    if (suppliedType && !allowedTypes.includes(suppliedType)) {
      return { ok: false, error: `${name} does not match its file type.` };
    }
    files.push({ name, size, contentType: suppliedType || allowedTypes[0] });
  }
  return { ok: true, files };
}
