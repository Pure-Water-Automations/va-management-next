/**
 * Profile-photo upload step 2: after the browser has PUT the image to R2,
 * record the object key on the Va row so the directory starts serving it.
 */
import { action } from "@/lib/api";
import { getEffectiveVaId } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { profilePhotoKey } from "@/lib/r2";

export const POST = action(async ({ user }) => {
  const vaId = await getEffectiveVaId(user);
  if (!vaId) throw new Error("Your login isn't linked to a VA record.");
  await db.va.update({ where: { vaId }, data: { photoKey: profilePhotoKey(vaId) } });
  return { vaId };
});
