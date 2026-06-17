/**
 * Pure recording-visibility logic — no DB/env/storage imports, so it stays
 * unit-testable (mirrors how src/lib/services/application-screen.ts keeps its
 * pure checks importable). Callers fetch the data and pass it in.
 */
import type { Role, RecordingVisibility } from "@prisma/client";
import { isGateReviewer } from "@/lib/auth/roles";

/** Minimal viewer shape needed to decide visibility. */
export type ViewerUser = { id: string; role: Role; isAdmin: boolean; vaId: string | null };

export type VisibilityRec = {
  uploaderUserId: string | null;
  vaId: string | null;
  visibility: RecordingVisibility;
  /** supervisorVaId of the owning VA, when known (for supervisor-chain access). */
  ownerSupervisorVaId?: string | null;
};

/**
 * Whether `user` may view `rec`. Admins and the uploader always can; HR-ish roles
 * (HR Manager / People-Ops / Team Lead) see internal + link recordings; a VA sees
 * their own and their direct reports'.
 */
export function canSeeRecording(user: ViewerUser, rec: VisibilityRec): boolean {
  if (user.isAdmin) return true;
  if (rec.uploaderUserId && rec.uploaderUserId === user.id) return true;
  if (rec.vaId && user.vaId && rec.vaId === user.vaId) return true;
  if (rec.visibility !== "private" && isGateReviewer(user.role)) return true;
  if (
    rec.visibility !== "private" &&
    rec.ownerSupervisorVaId &&
    user.vaId &&
    rec.ownerSupervisorVaId === user.vaId
  )
    return true;
  return false;
}
