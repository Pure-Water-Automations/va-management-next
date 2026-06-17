/**
 * Read/query helpers for recordings (server components + the get/list routes).
 * Video playback is served through the stream proxy (/api/recordings/stream/[id]);
 * thumbnails + downloads are short-lived presigned GET URLs minted here at render.
 */
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/access";
import { canSeeRecording } from "@/lib/actions/recordings";
import { presignDownload, r2Configured } from "@/lib/r2";

export type RecordingListItem = {
  id: string;
  title: string;
  status: string;
  visibility: string;
  durationSec: number | null;
  project: string | null;
  task: string | null;
  uploaderEmail: string | null;
  aiStatus: string | null;
  reviewStatus: string | null;
  createdAt: Date;
  thumbnailUrl: string | null;
};

export type TranscriptSegment = { start: number; end: number; text: string };

export type RecordingComment = {
  id: string;
  authorName: string | null;
  authorEmail: string | null;
  body: string | null;
  reaction: string | null;
  timestampSec: number | null;
  isPublic: boolean;
  createdAt: Date;
};

export type RecordingDetail = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  visibility: string;
  durationSec: number | null;
  mimeType: string;
  project: string | null;
  task: string | null;
  transcript: string | null;
  transcriptJson: TranscriptSegment[] | null;
  aiTitle: string | null;
  aiSummary: string | null;
  aiStatus: string | null;
  reviewStatus: string | null;
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  uploaderEmail: string | null;
  createdAt: Date;
  thumbnailUrl: string | null;
  downloadUrl: string | null;
  canManage: boolean;
  comments: RecordingComment[];
};

async function thumbUrl(key: string | null): Promise<string | null> {
  if (!key || !r2Configured()) return null;
  return presignDownload(key).catch(() => null);
}

/** Recordings the user may see. Admins see everything; otherwise filtered by canSee. */
export async function listVisibleRecordings(
  user: CurrentUser,
  filters?: { scope?: "mine" | "all"; project?: string; status?: string },
): Promise<RecordingListItem[]> {
  const scope = filters?.scope ?? (user.isAdmin ? "all" : "mine");
  const rows = await db.recording.findMany({
    where: {
      ...(scope === "mine" ? { uploaderUserId: user.id } : {}),
      ...(filters?.project ? { project: filters.project } : {}),
      ...(filters?.status ? { status: filters.status as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      visibility: true,
      durationSec: true,
      project: true,
      task: true,
      uploaderEmail: true,
      uploaderUserId: true,
      vaId: true,
      aiStatus: true,
      reviewStatus: true,
      createdAt: true,
      thumbnailKey: true,
      va: { select: { supervisorVaId: true } },
    },
    take: 200,
  });

  const visible = rows.filter((r) =>
    canSeeRecording(user, {
      uploaderUserId: r.uploaderUserId,
      vaId: r.vaId,
      visibility: r.visibility,
      ownerSupervisorVaId: r.va?.supervisorVaId ?? null,
    }),
  );

  return Promise.all(
    visible.map(async (r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      visibility: r.visibility,
      durationSec: r.durationSec,
      project: r.project,
      task: r.task,
      uploaderEmail: r.uploaderEmail,
      aiStatus: r.aiStatus,
      reviewStatus: r.reviewStatus,
      createdAt: r.createdAt,
      thumbnailUrl: r.status === "ready" ? await thumbUrl(r.thumbnailKey) : null,
    })),
  );
}

/** Full detail for the player page. Returns null if missing or not viewable. */
export async function getRecordingDetail(
  user: CurrentUser,
  id: string,
): Promise<RecordingDetail | null> {
  const rec = await db.recording.findUnique({
    where: { id },
    include: {
      va: { select: { supervisorVaId: true } },
      comments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!rec) return null;

  if (
    !canSeeRecording(user, {
      uploaderUserId: rec.uploaderUserId,
      vaId: rec.vaId,
      visibility: rec.visibility,
      ownerSupervisorVaId: rec.va?.supervisorVaId ?? null,
    })
  ) {
    return null;
  }

  const canManage = user.isAdmin || (!!rec.uploaderUserId && rec.uploaderUserId === user.id);
  const ready = rec.status === "ready";

  return {
    id: rec.id,
    title: rec.title,
    description: rec.description,
    status: rec.status,
    visibility: rec.visibility,
    durationSec: rec.durationSec,
    mimeType: rec.mimeType,
    project: rec.project,
    task: rec.task,
    transcript: rec.transcript,
    transcriptJson: (rec.transcriptJson as TranscriptSegment[] | null) ?? null,
    aiTitle: rec.aiTitle,
    aiSummary: rec.aiSummary,
    aiStatus: rec.aiStatus,
    reviewStatus: rec.reviewStatus,
    reviewNotes: rec.reviewNotes,
    reviewedBy: rec.reviewedBy,
    reviewedAt: rec.reviewedAt,
    uploaderEmail: rec.uploaderEmail,
    createdAt: rec.createdAt,
    thumbnailUrl: ready ? await thumbUrl(rec.thumbnailKey) : null,
    downloadUrl:
      ready && r2Configured()
        ? await presignDownload(rec.objectKey, 3600, `${rec.title || "recording"}.webm`).catch(() => null)
        : null,
    canManage,
    comments: rec.comments.map((c) => ({
      id: c.id,
      authorName: c.authorName,
      authorEmail: c.authorEmail,
      body: c.body,
      reaction: c.reaction,
      timestampSec: c.timestampSec,
      isPublic: c.isPublic,
      createdAt: c.createdAt,
    })),
  };
}
