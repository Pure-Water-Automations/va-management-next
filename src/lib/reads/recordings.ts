/**
 * Read/query helpers for recordings (server components + the get/list routes).
 * Video playback is served through the stream proxy (/api/recordings/stream/[id]);
 * thumbnails + downloads are short-lived presigned GET URLs minted here at render.
 */
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/access";
import { canSeeRecording } from "@/lib/actions/recordings";
import { isPubliclyViewable } from "@/lib/actions/recording-access";
import { presignDownload, r2Configured } from "@/lib/r2";
import { env } from "@/lib/env";

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
  clientOrganizationId: string | null;
  durationSec: number | null;
  trimStartSec: number | null;
  trimEndSec: number | null;
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
  enhanceStatus: string | null;
  enhanceError: string | null;
  enhancedDurationSec: number | null;
  enhanceStats: Record<string, unknown> | null;
  enhancedUrl: string | null;
  canManage: boolean;
  shareUrl: string | null;
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
  const shareUrl =
    rec.visibility === "link" && rec.shareToken && env.APP_BASE_URL
      ? `${env.APP_BASE_URL.replace(/\/+$/, "")}/watch/${rec.shareToken}`
      : null;

  return {
    id: rec.id,
    title: rec.title,
    description: rec.description,
    status: rec.status,
    visibility: rec.visibility,
    clientOrganizationId: rec.clientOrganizationId,
    durationSec: rec.durationSec,
    trimStartSec: rec.trimStartSec,
    trimEndSec: rec.trimEndSec,
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
    enhanceStatus: rec.enhanceStatus,
    enhanceError: rec.enhanceError,
    enhancedDurationSec: rec.enhancedDurationSec,
    enhanceStats: (rec.enhanceStats as Record<string, unknown> | null) ?? null,
    enhancedUrl:
      rec.enhanceStatus === "done" && rec.enhancedKey && r2Configured()
        ? await presignDownload(rec.enhancedKey, 3600, `${rec.title || "recording"}-enhanced.mp4`).catch(() => null)
        : null,
    canManage,
    shareUrl,
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

export type PublicRecordingDetail = {
  id: string;
  title: string;
  description: string | null;
  durationSec: number | null;
  trimStartSec: number | null;
  trimEndSec: number | null;
  thumbnailUrl: string | null;
  transcript: string | null;
  transcriptJson: TranscriptSegment[] | null;
  aiSummary: string | null;
  uploaderEmail: string | null;
  createdAt: Date;
};

/**
 * Public, unauthenticated lookup by share token — Loom-style "anyone with the
 * link." Only ever returns a recording that's still explicitly set to `visibility:
 * "link"` and `status: "ready"`; switching a recording back to private/internal or
 * deleting it makes any previously-shared link stop resolving immediately.
 */
export async function getPublicRecordingByToken(token: string): Promise<PublicRecordingDetail | null> {
  const rec = await db.recording.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      visibility: true,
      durationSec: true,
      trimStartSec: true,
      trimEndSec: true,
      thumbnailKey: true,
      transcript: true,
      transcriptJson: true,
      aiSummary: true,
      uploaderEmail: true,
      createdAt: true,
    },
  });
  if (!rec || !isPubliclyViewable(rec)) return null;

  return {
    id: rec.id,
    title: rec.title,
    description: rec.description,
    durationSec: rec.durationSec,
    trimStartSec: rec.trimStartSec,
    trimEndSec: rec.trimEndSec,
    thumbnailUrl: await thumbUrl(rec.thumbnailKey),
    transcript: rec.transcript,
    transcriptJson: (rec.transcriptJson as TranscriptSegment[] | null) ?? null,
    aiSummary: rec.aiSummary,
    uploaderEmail: rec.uploaderEmail,
    createdAt: rec.createdAt,
  };
}
