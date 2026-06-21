/**
 * Server-side mutations for in-app recordings. Called from the authenticated
 * /api/recordings/* routes (admin-only for now via the action() guard). Reads live
 * in src/lib/reads/recordings.ts. Storage helpers live in src/lib/r2.ts.
 */
import { randomUUID } from "crypto";
import type { RecordingVisibility } from "@prisma/client";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/access";
import { isGateReviewer } from "@/lib/auth/roles";
import { logActivity } from "@/lib/activity";
import {
  presignUpload,
  recordingKey,
  thumbnailKey,
  transcriptKey,
  r2Configured,
  r2Delete,
} from "@/lib/r2";
import { canSeeRecording } from "@/lib/actions/recording-access";

// Re-exported so existing importers (routes, reads) keep their import path.
export { canSeeRecording } from "@/lib/actions/recording-access";
export type { ViewerUser, VisibilityRec } from "@/lib/actions/recording-access";

const VISIBILITIES: RecordingVisibility[] = ["private", "internal", "link"];

function isOwnerOrAdmin(user: CurrentUser, rec: { uploaderUserId: string | null }): boolean {
  return user.isAdmin || (!!rec.uploaderUserId && rec.uploaderUserId === user.id);
}

export type CreateRecordingResult = {
  recordingId: string;
  uploadUrl: string;
  thumbUploadUrl: string;
  objectKey: string;
};

/** Create the row + presigned upload URLs. Bytes are PUT directly to R2 by the client. */
export async function createRecording(
  user: CurrentUser,
  input: { mimeType?: string; title?: string; project?: string; task?: string },
): Promise<CreateRecordingResult> {
  if (!r2Configured()) {
    throw new Error("Recording storage isn't configured yet (set R2_* env vars).");
  }
  const id = randomUUID();
  const mimeType = input.mimeType?.trim() || "video/webm";
  const objectKey = recordingKey(id);

  await db.recording.create({
    data: {
      id,
      objectKey,
      mimeType,
      title: input.title?.trim() || "Untitled recording",
      project: input.project?.trim() || null,
      task: input.task?.trim() || null,
      status: "uploading",
      thumbnailKey: thumbnailKey(id),
      vaId: user.vaId ?? null,
      uploaderUserId: user.id,
      uploaderEmail: user.email,
    },
  });

  const [uploadUrl, thumbUploadUrl] = await Promise.all([
    presignUpload(objectKey, mimeType),
    presignUpload(thumbnailKey(id), "image/jpeg"),
  ]);

  return { recordingId: id, uploadUrl, thumbUploadUrl, objectKey };
}

/** Mark the upload complete → playable, and queue AI processing (non-blocking). */
export async function finalizeRecording(
  user: CurrentUser,
  input: {
    recordingId: string;
    sizeBytes?: number;
    durationSec?: number;
    trimStartSec?: number;
    trimEndSec?: number;
  },
): Promise<{ id: string }> {
  const rec = await db.recording.findUnique({
    where: { id: input.recordingId },
    select: { id: true, uploaderUserId: true, title: true },
  });
  if (!rec) throw new Error("Recording not found.");
  if (!isOwnerOrAdmin(user, rec)) throw new Error("Not authorized.");

  // Only persist a trim range when it's a valid, non-trivial sub-range (a real
  // in/out the reviewer set). Otherwise leave null = play the whole clip.
  const start = Number.isFinite(input.trimStartSec) ? Math.max(0, input.trimStartSec!) : null;
  const end = Number.isFinite(input.trimEndSec) ? input.trimEndSec! : null;
  const hasTrim = start !== null && end !== null && end > start;

  const now = new Date();
  await db.recording.update({
    where: { id: rec.id },
    data: {
      status: "ready",
      uploadedAt: now,
      readyAt: now,
      sizeBytes: Number.isFinite(input.sizeBytes) ? Math.round(input.sizeBytes!) : undefined,
      durationSec: Number.isFinite(input.durationSec) ? input.durationSec : undefined,
      trimStartSec: hasTrim ? start : undefined,
      trimEndSec: hasTrim ? end : undefined,
      aiStatus: "pending", // worker/recordings-process.ts picks this up
    },
  });

  await logActivity({
    source: "recordings",
    eventType: "recording_uploaded",
    summary: `${user.name ?? user.email} uploaded a recording${rec.title ? ` ("${rec.title}")` : ""}`,
    vaId: user.vaId ?? null,
  });

  return { id: rec.id };
}

export async function updateRecording(
  user: CurrentUser,
  input: {
    recordingId: string;
    title?: string;
    description?: string;
    project?: string;
    task?: string;
    visibility?: string;
  },
): Promise<{ id: string }> {
  const rec = await db.recording.findUnique({
    where: { id: input.recordingId },
    select: { id: true, uploaderUserId: true },
  });
  if (!rec) throw new Error("Recording not found.");
  if (!isOwnerOrAdmin(user, rec)) throw new Error("Not authorized.");

  const visibility =
    input.visibility && VISIBILITIES.includes(input.visibility as RecordingVisibility)
      ? (input.visibility as RecordingVisibility)
      : undefined;

  await db.recording.update({
    where: { id: rec.id },
    data: {
      title: input.title?.trim() || undefined,
      description: input.description?.trim() ?? undefined,
      project: input.project !== undefined ? input.project.trim() || null : undefined,
      task: input.task !== undefined ? input.task.trim() || null : undefined,
      visibility,
    },
  });
  return { id: rec.id };
}

/** Delete the row (comments cascade) and best-effort delete the R2 objects. */
export async function deleteRecording(
  user: CurrentUser,
  input: { recordingId: string },
): Promise<{ id: string }> {
  const rec = await db.recording.findUnique({
    where: { id: input.recordingId },
    select: { id: true, uploaderUserId: true, objectKey: true, thumbnailKey: true, transcriptKey: true },
  });
  if (!rec) throw new Error("Recording not found.");
  if (!isOwnerOrAdmin(user, rec)) throw new Error("Not authorized.");

  if (r2Configured()) {
    for (const key of [rec.objectKey, rec.thumbnailKey, rec.transcriptKey]) {
      if (!key) continue;
      await r2Delete(key).catch((err) =>
        console.warn(`deleteRecording: R2 delete failed for ${key}:`, err instanceof Error ? err.message : err),
      );
    }
  }
  await db.recording.delete({ where: { id: rec.id } });

  await logActivity({
    source: "recordings",
    eventType: "recording_deleted",
    summary: `${user.name ?? user.email} deleted a recording`,
    vaId: user.vaId ?? null,
  });
  return { id: rec.id };
}

/** Add a comment and/or reaction (optionally anchored to a timestamp). */
export async function addComment(
  user: CurrentUser,
  input: { recordingId: string; body?: string; reaction?: string; timestampSec?: number },
): Promise<{ id: string }> {
  const rec = await db.recording.findUnique({
    where: { id: input.recordingId },
    select: { id: true, uploaderUserId: true, vaId: true, visibility: true, va: { select: { supervisorVaId: true } } },
  });
  if (!rec) throw new Error("Recording not found.");
  if (!canSeeRecording(user, { ...rec, ownerSupervisorVaId: rec.va?.supervisorVaId ?? null })) {
    throw new Error("Not authorized.");
  }

  const body = input.body?.trim() || null;
  const reaction = input.reaction?.trim() || null;
  if (!body && !reaction) throw new Error("A comment or reaction is required.");

  const comment = await db.recordingComment.create({
    data: {
      recordingId: rec.id,
      authorEmail: user.email,
      authorName: user.name ?? null,
      body,
      reaction,
      timestampSec: Number.isFinite(input.timestampSec) ? input.timestampSec : null,
    },
    select: { id: true },
  });
  return { id: comment.id };
}

const REVIEW_STATUSES = new Set(["needs_review", "reviewed", "flagged"]);

/** Supervisor/HR sets the review status. */
export async function reviewRecording(
  user: CurrentUser,
  input: { recordingId: string; reviewStatus: string; reviewNotes?: string },
): Promise<{ id: string }> {
  const status = input.reviewStatus.trim();
  if (!REVIEW_STATUSES.has(status)) {
    throw new Error("reviewStatus must be needs_review, reviewed, or flagged.");
  }
  const rec = await db.recording.findUnique({
    where: { id: input.recordingId },
    select: { id: true, vaId: true, va: { select: { supervisorVaId: true } } },
  });
  if (!rec) throw new Error("Recording not found.");

  const isSupervisor = !!rec.va?.supervisorVaId && rec.va.supervisorVaId === user.vaId;
  if (!user.isAdmin && !isGateReviewer(user.role) && !isSupervisor) {
    throw new Error("Not authorized to review.");
  }

  await db.recording.update({
    where: { id: rec.id },
    data: {
      reviewStatus: status,
      reviewedBy: user.email,
      reviewedAt: new Date(),
      reviewNotes: input.reviewNotes?.trim() || undefined,
    },
  });

  await logActivity({
    source: "recordings",
    eventType: "recording_reviewed",
    summary: `${user.name ?? user.email} marked a recording ${status}`,
    vaId: rec.vaId ?? null,
  });
  return { id: rec.id };
}
