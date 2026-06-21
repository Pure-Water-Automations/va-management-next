/**
 * Client-portal recording reads. Clients only ever see recordings explicitly
 * shared to their org (visibility = client, clientOrganizationId = their org),
 * and only once they're `ready`. Playback goes through the stream proxy, which
 * applies the same client-scoping check.
 */
import { db } from "@/lib/db";
import { presignDownload, r2Configured } from "@/lib/r2";
import type { TranscriptSegment } from "@/lib/reads/recordings";

const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type ClientRecordingListItem = {
  id: string;
  title: string;
  durationSec: number | null;
  presenter: string;
  createdAt: Date;
  thumbnailUrl: string | null;
  isNew: boolean;
};

export type ClientRecordingDetail = {
  id: string;
  title: string;
  durationSec: number | null;
  presenter: string;
  createdAt: Date;
  aiSummary: string | null;
  transcriptJson: TranscriptSegment[] | null;
  comments: {
    id: string;
    authorName: string | null;
    body: string | null;
    reaction: string | null;
    timestampSec: number | null;
    createdAt: Date;
  }[];
};

function presenterName(va: { name: string } | null, email: string | null): string {
  return va?.name ?? (email ? email.split("@")[0]! : "Your team");
}

async function thumbUrl(key: string | null): Promise<string | null> {
  if (!key || !r2Configured()) return null;
  return presignDownload(key).catch(() => null);
}

export async function listClientRecordings(orgId: string): Promise<ClientRecordingListItem[]> {
  const rows = await db.recording.findMany({
    where: { visibility: "client", clientOrganizationId: orgId, status: "ready" },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      title: true,
      aiTitle: true,
      durationSec: true,
      uploaderEmail: true,
      createdAt: true,
      thumbnailKey: true,
      va: { select: { name: true } },
    },
  });
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      title: r.aiTitle || r.title,
      durationSec: r.durationSec,
      presenter: presenterName(r.va, r.uploaderEmail),
      createdAt: r.createdAt,
      thumbnailUrl: await thumbUrl(r.thumbnailKey),
      isNew: Date.now() - r.createdAt.getTime() < NEW_WINDOW_MS,
    })),
  );
}

export async function getClientRecording(orgId: string, id: string): Promise<ClientRecordingDetail | null> {
  const rec = await db.recording.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      aiTitle: true,
      durationSec: true,
      uploaderEmail: true,
      createdAt: true,
      status: true,
      visibility: true,
      clientOrganizationId: true,
      aiSummary: true,
      transcriptJson: true,
      va: { select: { name: true } },
      comments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!rec) return null;
  if (rec.visibility !== "client" || rec.clientOrganizationId !== orgId || rec.status !== "ready") {
    return null;
  }
  return {
    id: rec.id,
    title: rec.aiTitle || rec.title,
    durationSec: rec.durationSec,
    presenter: presenterName(rec.va, rec.uploaderEmail),
    createdAt: rec.createdAt,
    aiSummary: rec.aiSummary,
    transcriptJson: (rec.transcriptJson as TranscriptSegment[] | null) ?? null,
    comments: rec.comments.map((c) => ({
      id: c.id,
      authorName: c.authorName,
      body: c.body,
      reaction: c.reaction,
      timestampSec: c.timestampSec,
      createdAt: c.createdAt,
    })),
  };
}
