import { action, str } from "@/lib/api";
import { submitSkillAttestation } from "@/lib/actions/skill-attestation";

export const POST = action(async ({ user, body }) => {
  const raw = body.skills;
  const skills = Array.isArray(raw) ? raw.map((s) => String(s)) : [];
  return submitSkillAttestation(str(body, "vaId"), skills, user.vaId ?? null, user.email, { isAdmin: user.isAdmin });
});
