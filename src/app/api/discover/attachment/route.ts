import type { Prisma } from "@prisma/client";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { presignUpload, r2, r2Configured, r2Delete } from "@/lib/r2";
import {
  MAX_DISCOVERY_ATTACHMENTS,
  validateDiscoveryAttachments,
} from "@/lib/discovery-attachment-validation";
import {
  checkDiscoveryRateLimit,
  createDiscoveryConfirmGrant,
  DISCOVERY_UPLOAD_EXPIRES_SECONDS,
  DiscoveryAttachmentError,
  discoveryAttachmentKey,
  isDiscoveryAttachmentKey,
  verifyDiscoveryAttachmentGrant,
} from "@/lib/discovery-attachments";

const MAX_BODY_BYTES = 12_000;

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function POST(request: Request): Promise<Response> {
  const rate = checkDiscoveryRateLimit(request, "attachment");
  if (!rate.ok) {
    return Response.json(
      { ok: false, error: "Too many attachment requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } },
    );
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "Attachment request too large." }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "Invalid attachment request." }, { status: 400 });
  }

  try {
    const op = body.op === "confirm" ? "confirm" : body.op === "presign" ? "presign" : null;
    const dealId = typeof body.dealId === "string" ? body.dealId : "";
    const grantToken = typeof body.grant === "string" ? body.grant : "";
    const grant = verifyDiscoveryAttachmentGrant(grantToken, env.NEXTAUTH_SECRET);
    if (!op || !dealId || !grant || grant.dealId !== dealId || grant.kind !== (op === "presign" ? "submit" : "confirm")) {
      return Response.json({ ok: false, error: "This attachment link is invalid or expired." }, { status: 403 });
    }

    if (op === "presign") {
      if (!r2Configured()) throw new DiscoveryAttachmentError("Attachment storage is not available right now.");
      const validation = validateDiscoveryAttachments(body.files);
      if (!validation.ok) throw new DiscoveryAttachmentError(validation.error);
      if (validation.files.length === 0) throw new DiscoveryAttachmentError("Choose at least one attachment.");

      const deal = await db.deal.findUnique({ where: { id: dealId }, select: { attachmentKeys: true } });
      if (!deal) throw new DiscoveryAttachmentError("Lead submission not found.");
      const existingKeys = stringArray(deal.attachmentKeys);
      if (existingKeys.length + validation.files.length > MAX_DISCOVERY_ATTACHMENTS) {
        throw new DiscoveryAttachmentError(`This lead can have up to ${MAX_DISCOVERY_ATTACHMENTS} attachments.`);
      }

      const pending = validation.files.map((file) => ({
        key: discoveryAttachmentKey(dealId, file.name),
        name: file.name,
        contentType: file.contentType,
      }));
      const uploadUrls = await Promise.all(
        pending.map((file) => presignUpload(file.key, file.contentType, DISCOVERY_UPLOAD_EXPIRES_SECONDS)),
      );
      const keys = pending.map((file) => file.key);
      return Response.json({
        ok: true,
        result: {
          uploads: pending.map((file, index) => ({ ...file, uploadUrl: uploadUrls[index] })),
          confirmGrant: createDiscoveryConfirmGrant(dealId, keys, env.NEXTAUTH_SECRET),
        },
      });
    }

    const allowedKeys = grant.keys ?? [];
    const requestedKeys = stringArray(body.keys);
    if (requestedKeys.length === 0 || requestedKeys.length > MAX_DISCOVERY_ATTACHMENTS) {
      throw new DiscoveryAttachmentError("No completed attachments to confirm.");
    }
    if (requestedKeys.some((key) => !allowedKeys.includes(key) || !isDiscoveryAttachmentKey(key, dealId))) {
      return Response.json({ ok: false, error: "Invalid attachment confirmation." }, { status: 403 });
    }

    // The presign request validates the browser's declared size. Verify the real
    // stored bytes too, so a hostile client cannot PUT a larger body than declared.
    let storedFiles: Array<{ name: string; size: number; type: string }>;
    try {
      storedFiles = await Promise.all(requestedKeys.map(async (key) => {
        const head = await r2().send(new HeadObjectCommand({ Bucket: env.R2_BUCKET!, Key: key }));
        return {
          name: key.split("/").pop()?.replace(/^[0-9a-f-]{36}-/i, "") || "attachment",
          size: head.ContentLength ?? 0,
          type: head.ContentType ?? "",
        };
      }));
    } catch {
      throw new DiscoveryAttachmentError("One or more attachments did not finish uploading.");
    }
    const storedValidation = validateDiscoveryAttachments(storedFiles);
    if (!storedValidation.ok) {
      await Promise.allSettled(requestedKeys.map((key) => r2Delete(key)));
      throw new DiscoveryAttachmentError(storedValidation.error);
    }

    const deal = await db.deal.findUnique({ where: { id: dealId }, select: { attachmentKeys: true } });
    if (!deal) throw new DiscoveryAttachmentError("Lead submission not found.");
    const merged = [...new Set([...stringArray(deal.attachmentKeys), ...requestedKeys])];
    if (merged.length > MAX_DISCOVERY_ATTACHMENTS) {
      throw new DiscoveryAttachmentError(`This lead can have up to ${MAX_DISCOVERY_ATTACHMENTS} attachments.`);
    }
    await db.deal.update({
      where: { id: dealId },
      data: { attachmentKeys: merged as Prisma.InputJsonValue },
    });
    return Response.json({ ok: true, result: { attachmentKeys: merged } });
  } catch (error) {
    if (error instanceof DiscoveryAttachmentError) {
      return Response.json({ ok: false, error: error.message }, { status: 400 });
    }
    console.error("discover attachment failed:", error);
    return Response.json({ ok: false, error: "Could not process attachments right now." }, { status: 500 });
  }
}
