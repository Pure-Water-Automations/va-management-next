/**
 * Profile-photo upload step 1: presign a direct browser PUT to R2 (bytes never
 * pass through this server — same pattern as recordings). The client PUTs to
 * `uploadUrl`, then POSTs to ./finalize to record the key on the Va row.
 */
import { action, str } from "@/lib/api";
import { getEffectiveVaId } from "@/lib/auth/access";
import { presignUpload, profilePhotoKey, r2Configured } from "@/lib/r2";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const POST = action(async ({ user, body }) => {
  const vaId = await getEffectiveVaId(user);
  if (!vaId) throw new Error("Your login isn't linked to a VA record.");
  if (!r2Configured()) throw new Error("Photo storage isn't configured on this server.");

  const contentType = str(body, "contentType");
  if (!ALLOWED_TYPES.has(contentType)) {
    throw new Error("Photo must be a JPEG, PNG, or WebP image.");
  }

  const key = profilePhotoKey(vaId);
  const uploadUrl = await presignUpload(key, contentType, 600);
  return { key, uploadUrl };
});
