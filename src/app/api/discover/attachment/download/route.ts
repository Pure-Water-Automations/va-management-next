import { getCurrentUser } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { presignDownload, r2Configured } from "@/lib/r2";
import {
  discoveryAttachmentName,
  isDiscoveryAttachmentKey,
} from "@/lib/discovery-attachments";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return new Response("Not authenticated", { status: 401 });
  }
  if (user.role === "CLIENT_ADMIN" || user.role === "CLIENT_MEMBER") {
    return new Response("Not authorized", { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const dealId = params.get("dealId") ?? "";
  const index = Number(params.get("index"));
  if (!dealId || !Number.isInteger(index) || index < 0) return new Response("Not found", { status: 404 });

  const deal = await db.deal.findUnique({ where: { id: dealId }, select: { attachmentKeys: true } });
  const keys = Array.isArray(deal?.attachmentKeys)
    ? deal.attachmentKeys.filter((item): item is string => typeof item === "string")
    : [];
  const key = keys[index];
  if (!key || !isDiscoveryAttachmentKey(key, dealId) || !r2Configured()) {
    return new Response("Not found", { status: 404 });
  }

  const signed = await presignDownload(key, 300, discoveryAttachmentName(key));
  return new Response(null, {
    status: 302,
    headers: { Location: signed, "Cache-Control": "private, no-store" },
  });
}
