/**
 * rtms-live — Zoom Meeting App Phase 2: live in-meeting capture.
 *
 * Long-running systemd service (va-management-rtms.service — Type=simple, NOT a
 * timer). The Zoom webhook queues `meeting.rtms_started` events as
 * ZoomMeetingCapture rows (source=RTMS, status=PENDING); this worker polls for
 * them, joins the meeting's Realtime Media Stream via the official @zoom/rtms
 * SDK (transcript media only — no bot joins the call, no home-grown STT), and
 * classifies the conversation in rolling windows (src/lib/zoom/live-classify)
 * with speaker roles resolved BEFORE classification (src/lib/zoom/identity).
 *
 * Proposed items are appended to the SAME MeetingAction pipeline the harvester
 * and Phase-1 recordings use (source="ZOOM_APP_LIVE"), so /meeting-actions and
 * the in-meeting panel are two views over one review queue.
 *
 * Resilience model:
 *  - @zoom/rtms is an optionalDependency (native module). If it isn't installed
 *    on this host, PENDING sessions are marked SKIPPED — the Phase-1 recording
 *    fallback in recordCapture() then owns those meetings.
 *  - Status flow: PENDING → LIVE → PROCESSED. Join errors → FAILED (retried up
 *    to RTMS_MAX_JOIN_ATTEMPTS, then left FAILED so the recording fallback can
 *    take over). A worker restart adopts LIVE rows: rejoin if the stream is
 *    still up, else finalize.
 *  - The webhook's rtms_stopped stamp, the SDK's own close callbacks, an idle
 *    timeout, and a max-session cap ALL end a session — whichever fires first.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logActivity } from "@/lib/activity";
import { openrouterChat } from "@/lib/matrix/openrouter";
import {
  buildSpeakerCache,
  resolveSpeaker,
  type KnownPerson,
  type ResolvedSpeaker,
} from "@/lib/zoom/identity";
import {
  buildLiveMessages,
  contextTail,
  isDuplicateTitle,
  LIVE_CLASSIFY_DEFAULTS,
  parseLiveItems,
  shouldClassify,
  takeWindow,
  unclassifiedChars,
  type LiveSegment,
} from "@/lib/zoom/live-classify";
import type { RtmsCapturePayload } from "@/lib/zoom/rtms";

// ── Tunables (env-overridable, mirrors the other workers' style) ─────────────
const POLL_MS = Number(process.env.RTMS_POLL_MS || "3000");
const MIN_CONFIDENCE = Number(process.env.RTMS_MIN_CONFIDENCE || String(LIVE_CLASSIFY_DEFAULTS.minConfidence));
const IDLE_END_MS = Number(process.env.RTMS_IDLE_END_MS || String(30 * 60_000)); // no speech → end
const MAX_SESSION_MS = Number(process.env.RTMS_MAX_SESSION_MS || String(5 * 60 * 60_000));
const STALE_PENDING_MS = Number(process.env.RTMS_STALE_PENDING_MS || String(2 * 60 * 60_000));
const MAX_JOIN_ATTEMPTS = Number(process.env.RTMS_MAX_JOIN_ATTEMPTS || "3");
const PEOPLE_REFRESH_MS = 10 * 60_000;
const EXTRACTION_MODEL = env.OPENROUTER_TRANSCRIPT_MODEL || "google/gemini-2.5-flash-lite";
const SMOKE = process.argv.includes("--smoke") || process.env.RTMS_SMOKE === "1";

// ── Minimal @zoom/rtms surface (loaded dynamically; never a static import so
//    typecheck and non-installed hosts stay green) ─────────────────────────────
type RtmsClient = {
  join(params: Record<string, unknown>): unknown;
  leave?: () => void;
  poll?: () => void;
  onTranscriptData?: (cb: (...args: unknown[]) => void) => void;
  onJoinConfirm?: (cb: (...args: unknown[]) => void) => void;
  onSessionUpdate?: (cb: (...args: unknown[]) => void) => void;
  onSessionStateUpdate?: (cb: (...args: unknown[]) => void) => void;
  onLeave?: (cb: (...args: unknown[]) => void) => void;
};
type RtmsSdk = { Client: new () => RtmsClient; SESSION_EVENT_STOP?: number };

function loadRtmsSdk(): RtmsSdk | null {
  try {
    const req =
      typeof require !== "undefined"
        ? require
        : createRequire(path.join(process.cwd(), "package.json"));
    const mod = req("@zoom/rtms") as { default?: unknown } & Record<string, unknown>;
    const sdk = (mod?.default ?? mod) as RtmsSdk;
    return typeof sdk?.Client === "function" ? sdk : null;
  } catch {
    return null;
  }
}

// ── Session state ────────────────────────────────────────────────────────────
type LiveSession = {
  captureId: string;
  meetingUuid: string;
  topic: string;
  startedAt: Date;
  zoomAccountEmail: string | null;
  client: RtmsClient | null;
  pollTimer: NodeJS.Timeout | null;
  segments: LiveSegment[];
  cursor: number; // index of the first unclassified segment
  segmentCount: number; // total ever received (segments[] gets trimmed)
  lastClassifyAt: number; // 0 = never
  lastSegmentAt: number; // 0 = none yet
  joinedAt: number;
  classifying: boolean;
  parseFailures: number;
  endedReason: string | null; // non-null → drain + finalize
  actionId: string | null;
  proposedTitles: string[];
  itemsProposed: number;
  people: KnownPerson[];
  peopleLoadedAt: number;
  speakerCache: Map<string, ResolvedSpeaker>;
};

const sessions = new Map<string, LiveSession>();
let rtmsSdk: RtmsSdk | null = null;

const log = (msg: string) => console.log(`rtms-live: ${msg}`);
const shortUuid = (u: string) => (u.length > 12 ? `${u.slice(0, 12)}…` : u);

async function loadPeople(): Promise<KnownPerson[]> {
  const users = await db.user.findMany({
    where: { active: true },
    select: { id: true, name: true, email: true, role: true },
  });
  return users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role as string }));
}

function rosterLines(s: LiveSession): string[] {
  const lines: string[] = [];
  for (const r of s.speakerCache.values()) {
    const matched =
      r.resolution === "unknown" ? "unmatched" : `matched: ${r.email ?? r.userId ?? "?"} (${r.resolution})`;
    lines.push(`[${r.label}] ${r.display} (${matched})`);
  }
  return lines;
}

// ── Persistence ──────────────────────────────────────────────────────────────

async function ensureAction(s: LiveSession): Promise<string> {
  if (s.actionId) return s.actionId;
  const meetingFile = `zoom-app://${s.meetingUuid}`;
  const existing = await db.meetingAction.findUnique({
    where: { meetingFile },
    select: { id: true, items: { select: { title: true } } },
  });
  if (existing) {
    s.actionId = existing.id;
    // Dedupe across worker restarts: remember titles already proposed.
    for (const it of existing.items) {
      if (!s.proposedTitles.includes(it.title)) s.proposedTitles.push(it.title);
    }
    return existing.id;
  }
  const created = await db.meetingAction.create({
    data: {
      meetingFile,
      meetingTitle: s.topic,
      meetingDate: s.startedAt,
      zoomAccount: s.zoomAccountEmail,
      source: "ZOOM_APP_LIVE",
      status: "PENDING",
    },
    select: { id: true },
  });
  s.actionId = created.id;
  await db.zoomMeetingCapture.update({
    where: { id: s.captureId },
    data: { meetingActionId: created.id },
  });
  return created.id;
}

async function persistStats(s: LiveSession): Promise<void> {
  const row = await db.zoomMeetingCapture.findUnique({ where: { id: s.captureId }, select: { payload: true } });
  const prev = (row?.payload ?? {}) as Partial<RtmsCapturePayload>;
  const payload = {
    ...prev,
    topic: s.topic,
    stats: {
      segments: s.segmentCount,
      itemsProposed: s.itemsProposed,
      lastActivityAt: new Date(s.lastSegmentAt || Date.now()).toISOString(),
    },
  };
  await db.zoomMeetingCapture.update({
    where: { id: s.captureId },
    data: { payload: JSON.parse(JSON.stringify(payload)) },
  });
}

// ── Classification pass ──────────────────────────────────────────────────────

async function runClassify(s: LiveSession, final: boolean): Promise<void> {
  if (s.classifying) return;
  s.classifying = true;
  try {
    const { text, nextIdx } = takeWindow(s.segments, s.cursor);
    if (!text.trim()) {
      s.cursor = nextIdx;
      return;
    }
    const messages = buildLiveMessages({
      meetingTitle: s.topic,
      dateIso: s.startedAt.toISOString(),
      rosterLines: rosterLines(s),
      alreadyProposed: s.proposedTitles,
      contextText: contextTail(s.segments, s.cursor),
      windowText: text,
    });
    const llm = await openrouterChat({ messages, temperature: 0.2, max_tokens: 1200, model: EXTRACTION_MODEL });
    const items = parseLiveItems(llm.choices?.[0]?.message?.content ?? "");
    if (items === null) {
      s.parseFailures++;
      if (s.parseFailures >= 3) {
        log(`${shortUuid(s.meetingUuid)}: skipping a poison window after 3 unparseable outputs`);
        s.cursor = nextIdx;
        s.parseFailures = 0;
        s.lastClassifyAt = Date.now();
      }
      return; // otherwise leave the cursor — the window retries on the next debounce
    }

    s.cursor = nextIdx;
    s.parseFailures = 0;
    s.lastClassifyAt = Date.now();

    const kept = items.filter((it) => {
      if (it.confidence < MIN_CONFIDENCE) {
        log(`${shortUuid(s.meetingUuid)}: dropped low-confidence (${it.confidence.toFixed(2)}) "${it.title}"`);
        return false;
      }
      if (isDuplicateTitle(it.title, s.proposedTitles)) {
        log(`${shortUuid(s.meetingUuid)}: dropped duplicate "${it.title}"`);
        return false;
      }
      return true;
    });
    if (kept.length === 0) {
      if (final) await persistStats(s);
      return;
    }

    const actionId = await ensureAction(s);
    for (const it of kept) {
      await db.meetingActionItem.create({
        data: {
          meetingActionId: actionId,
          title: it.title,
          description: it.description ?? null,
          suggestedAssignee: it.suggestedAssignee ?? null,
          suggestedDueDate: it.suggestedDueDate ? new Date(it.suggestedDueDate) : null,
          clientContext: it.clientContext ?? null,
          kind: it.kind,
          confidence: it.confidence,
          evidenceQuote: it.evidenceQuote ?? null,
        },
      });
      s.proposedTitles.push(it.title);
    }
    s.itemsProposed += kept.length;
    log(`${shortUuid(s.meetingUuid)}: +${kept.length} live item(s) (total ${s.itemsProposed})`);
    await persistStats(s);
  } catch (err) {
    log(`${shortUuid(s.meetingUuid)}: classify error — ${err instanceof Error ? err.message : err}`);
  } finally {
    s.classifying = false;
  }
}

// ── Session lifecycle ────────────────────────────────────────────────────────

type CaptureRow = {
  id: string;
  meetingUuid: string;
  topic: string;
  hostZoomId: string;
  attempts: number;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
};

async function joinSession(row: CaptureRow): Promise<void> {
  const payload = (row.payload ?? {}) as Partial<RtmsCapturePayload>;
  const rtms = payload.rtms;
  if (!rtms?.streamId || !rtms?.serverUrls) {
    await db.zoomMeetingCapture.update({
      where: { id: row.id },
      data: { status: "SKIPPED", error: "no RTMS join info in payload", processedAt: new Date() },
    });
    return;
  }
  if (!rtmsSdk) {
    await db.zoomMeetingCapture.update({
      where: { id: row.id },
      data: {
        status: "SKIPPED",
        error: "@zoom/rtms SDK not installed on this host — recording fallback will cover this meeting",
        processedAt: new Date(),
      },
    });
    log(`${shortUuid(row.meetingUuid)}: skipped (SDK unavailable)`);
    return;
  }

  const operatorId = rtms.operatorId ?? row.hostZoomId;
  const conn = operatorId
    ? await db.zoomConnection.findUnique({ where: { zoomUserId: operatorId }, select: { email: true } })
    : null;

  const s: LiveSession = {
    captureId: row.id,
    meetingUuid: row.meetingUuid,
    topic: payload.topic || row.topic || "Zoom live meeting",
    startedAt: payload.startedAt ? new Date(payload.startedAt) : row.createdAt,
    zoomAccountEmail: conn?.email ?? null,
    client: null,
    pollTimer: null,
    segments: [],
    cursor: 0,
    segmentCount: 0,
    lastClassifyAt: 0,
    lastSegmentAt: 0,
    joinedAt: Date.now(),
    classifying: false,
    parseFailures: 0,
    endedReason: null,
    actionId: null,
    proposedTitles: [],
    itemsProposed: 0,
    people: await loadPeople(),
    peopleLoadedAt: Date.now(),
    speakerCache: new Map(),
  };
  // Roster the panel may already have pushed.
  if (Array.isArray(payload.roster)) {
    s.speakerCache = buildSpeakerCache(payload.roster.map((r) => r.name).filter(Boolean), s.people);
  }

  try {
    const client = new rtmsSdk.Client();
    s.client = client;

    // Signature variance across SDK versions: transcript callbacks may be
    // (data, size, timestamp, metadata) or (data, timestamp, metadata) — sniff args.
    client.onTranscriptData?.((...args: unknown[]) => {
      const data = args[0];
      let timestamp: number | undefined;
      let metadata: { userName?: string } | undefined;
      for (const a of args.slice(1)) {
        if (typeof a === "number" && a > 1_000_000_000_000) timestamp = a;
        else if (a && typeof a === "object") metadata = a as { userName?: string };
      }
      const text = (Buffer.isBuffer(data) ? data.toString("utf8") : String(data ?? "")).trim();
      if (!text) return;
      const name = metadata?.userName?.trim() || "Unknown speaker";
      let resolved = s.speakerCache.get(name);
      if (!resolved) {
        resolved = resolveSpeaker(name, s.people);
        s.speakerCache.set(name, resolved);
      }
      s.segments.push({ ts: timestamp ?? Date.now(), speaker: name, roleLabel: resolved.label, text });
      s.segmentCount++;
      s.lastSegmentAt = Date.now();
      // Bound memory on marathon meetings: keep a classified tail for context only.
      if (s.cursor > 4000) {
        const drop = s.cursor - 500;
        s.segments.splice(0, drop);
        s.cursor -= drop;
      }
    });
    client.onJoinConfirm?.((...args: unknown[]) => log(`${shortUuid(s.meetingUuid)}: join confirmed (reason=${String(args[0] ?? "")})`));
    client.onLeave?.((...args: unknown[]) => {
      log(`${shortUuid(s.meetingUuid)}: stream left (reason=${String(args[0] ?? "")})`);
      s.endedReason = s.endedReason ?? "stream left";
    });
    // onSessionUpdate passes a numeric op (SESSION_EVENT_*); compare against the
    // SDK's own STOP constant when it exports one, else fall back to a string match.
    const stopOp = typeof rtmsSdk.SESSION_EVENT_STOP === "number" ? rtmsSdk.SESSION_EVENT_STOP : null;
    client.onSessionUpdate?.((...args: unknown[]) => {
      const op = args[0];
      const stopped =
        (stopOp !== null && op === stopOp) || (typeof op === "string" && /stop|end|close/i.test(op));
      if (stopped) s.endedReason = s.endedReason ?? "session stopped";
    });

    client.join({
      meeting_uuid: row.meetingUuid,
      rtms_stream_id: rtms.streamId,
      server_urls: rtms.serverUrls,
      client: env.ZOOM_CLIENT_ID!.trim(),
      secret: env.ZOOM_CLIENT_SECRET!.trim(),
    });
    // Some SDK builds require the caller to drive the event loop.
    if (typeof client.poll === "function") {
      s.pollTimer = setInterval(() => {
        try {
          client.poll!();
        } catch {
          /* polling errors surface via onLeave */
        }
      }, 150);
    }

    sessions.set(row.meetingUuid, s);
    await db.zoomMeetingCapture.update({ where: { id: row.id }, data: { status: "LIVE", error: null } });
    await logActivity({
      source: "zoom",
      eventType: "rtms_session_started",
      severity: "info",
      summary: `Live capture joined "${s.topic}" (${shortUuid(s.meetingUuid)})`,
    }).catch(() => {});
    log(`${shortUuid(s.meetingUuid)}: joined (topic "${s.topic}")`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (s.pollTimer) clearInterval(s.pollTimer);
    sessions.delete(row.meetingUuid);
    await db.zoomMeetingCapture.update({
      where: { id: row.id },
      data: { status: "FAILED", attempts: row.attempts + 1, error: msg.slice(0, 300) },
    });
    log(`${shortUuid(row.meetingUuid)}: join failed (attempt ${row.attempts + 1}/${MAX_JOIN_ATTEMPTS}) — ${msg.split("\n")[0]}`);
  }
}

async function finalizeSession(s: LiveSession, reason: string): Promise<void> {
  sessions.delete(s.meetingUuid);
  if (s.pollTimer) clearInterval(s.pollTimer);
  try {
    s.client?.leave?.();
  } catch {
    /* already gone */
  }
  // Final sweep over whatever is still unclassified.
  if (unclassifiedChars(s.segments, s.cursor) > 0) {
    await runClassify(s, true);
  }
  await persistStats(s);
  await db.zoomMeetingCapture.update({
    where: { id: s.captureId },
    data: { status: "PROCESSED", processedAt: new Date(), meetingActionId: s.actionId, error: null },
  });
  await db.syncRun.create({
    data: {
      worker: "rtms-live",
      status: "SUCCESS",
      finishedAt: new Date(),
      detailsJson: {
        meetingUuid: s.meetingUuid,
        topic: s.topic,
        segments: s.segmentCount,
        itemsProposed: s.itemsProposed,
        durationMs: Date.now() - s.joinedAt,
        endedReason: reason,
      },
    },
  }).catch(() => {});
  await logActivity({
    source: "zoom",
    eventType: "rtms_session_ended",
    severity: "success",
    summary: `Live capture ended for "${s.topic}" — ${s.itemsProposed} proposed item(s) (${reason})`,
  }).catch(() => {});
  log(`${shortUuid(s.meetingUuid)}: finalized — ${s.itemsProposed} item(s), ${s.segmentCount} segments (${reason})`);
}

// ── Sweeps ───────────────────────────────────────────────────────────────────

async function sweepJoinable(): Promise<void> {
  const rows = await db.zoomMeetingCapture.findMany({
    where: { source: "RTMS", status: { in: ["PENDING", "FAILED"] }, attempts: { lt: MAX_JOIN_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: 5,
  });
  for (const row of rows) {
    if (sessions.has(row.meetingUuid)) continue;
    const payload = (row.payload ?? {}) as Partial<RtmsCapturePayload>;
    // Stream already stopped, or the row went stale before we could join → let
    // the recording fallback own the meeting instead of joining a dead stream.
    const stopped = payload.stoppedAt && Date.parse(payload.stoppedAt) < Date.now() - 5 * 60_000;
    const stale = row.createdAt.getTime() < Date.now() - STALE_PENDING_MS;
    if (stopped || stale) {
      await db.zoomMeetingCapture.update({
        where: { id: row.id },
        data: {
          status: "SKIPPED",
          error: stopped ? "stream stopped before the worker joined" : "stale — never joined",
          processedAt: new Date(),
        },
      });
      continue;
    }
    if (SMOKE) {
      log(`${shortUuid(row.meetingUuid)}: joinable (smoke mode — not joining)`);
      continue;
    }
    await joinSession(row);
  }
}

/** Adopt LIVE rows that have no in-memory session (worker restarted mid-meeting). */
async function sweepOrphanedLive(): Promise<void> {
  const rows = await db.zoomMeetingCapture.findMany({
    where: { source: "RTMS", status: "LIVE" },
    take: 20,
  });
  for (const row of rows) {
    if (sessions.has(row.meetingUuid)) continue;
    const payload = (row.payload ?? {}) as Partial<RtmsCapturePayload>;
    const stopped = !!payload.stoppedAt;
    const stale = row.updatedAt.getTime() < Date.now() - MAX_SESSION_MS;
    if (stopped || stale || SMOKE || !rtmsSdk) {
      // Meeting over (or we can't rejoin) — close it out; items already
      // persisted incrementally survive.
      await db.zoomMeetingCapture.update({
        where: { id: row.id },
        data: { status: "PROCESSED", processedAt: new Date(), error: null },
      });
      log(`${shortUuid(row.meetingUuid)}: orphaned LIVE row closed (${stopped ? "stopped" : stale ? "stale" : "no rejoin"})`);
      continue;
    }
    // Stream may still be up — retry the join with the stored credentials.
    await db.zoomMeetingCapture.update({ where: { id: row.id }, data: { status: "PENDING" } });
    log(`${shortUuid(row.meetingUuid)}: orphaned LIVE row re-queued for rejoin`);
  }
}

/** Per-tick session upkeep: absorb webhook stop stamps + panel roster/topic, end-detect, classify. */
async function tickSessions(): Promise<void> {
  for (const s of Array.from(sessions.values())) {
    const row = await db.zoomMeetingCapture.findUnique({
      where: { id: s.captureId },
      select: { payload: true },
    });
    const payload = (row?.payload ?? {}) as Partial<RtmsCapturePayload>;
    if (payload.topic && payload.topic !== s.topic) {
      s.topic = payload.topic;
      if (s.actionId) {
        await db.meetingAction.update({ where: { id: s.actionId }, data: { meetingTitle: s.topic } }).catch(() => {});
      }
    }
    if (Array.isArray(payload.roster)) {
      for (const r of payload.roster) {
        if (r?.name && !s.speakerCache.has(r.name)) s.speakerCache.set(r.name, resolveSpeaker(r.name, s.people));
      }
    }
    if (payload.stoppedAt && !s.endedReason) s.endedReason = "webhook rtms_stopped";
    if (!s.endedReason && s.lastSegmentAt && Date.now() - s.lastSegmentAt > IDLE_END_MS) {
      s.endedReason = "idle timeout";
    }
    if (!s.endedReason && Date.now() - s.joinedAt > MAX_SESSION_MS) s.endedReason = "max session length";
    if (!s.endedReason && !s.lastSegmentAt && Date.now() - s.joinedAt > 20 * 60_000) {
      s.endedReason = "no transcript data after 20m";
    }

    if (s.peopleLoadedAt < Date.now() - PEOPLE_REFRESH_MS) {
      s.people = await loadPeople();
      s.peopleLoadedAt = Date.now();
    }

    const gate = {
      unclassifiedChars: unclassifiedChars(s.segments, s.cursor),
      msSinceLastClassify: s.lastClassifyAt ? Date.now() - s.lastClassifyAt : Infinity,
      sessionEnding: !!s.endedReason,
    };
    if (!s.classifying && shouldClassify(gate)) {
      void runClassify(s, !!s.endedReason);
    }
    if (s.endedReason && !s.classifying && unclassifiedChars(s.segments, s.cursor) === 0) {
      await finalizeSession(s, s.endedReason);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!env.ZOOM_CLIENT_ID?.trim() || !env.ZOOM_CLIENT_SECRET?.trim()) {
    log("disabled (ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET not set) — exiting cleanly");
    return;
  }
  if (!env.OPENROUTER_API_KEY?.trim() && !env.NVIDIA_API_KEY?.trim()) {
    log("disabled (no LLM key configured) — exiting cleanly");
    return;
  }
  // The @zoom/rtms SDK reads its signing credentials from these env vars.
  process.env.ZM_RTMS_CLIENT = process.env.ZM_RTMS_CLIENT || env.ZOOM_CLIENT_ID.trim();
  process.env.ZM_RTMS_SECRET = process.env.ZM_RTMS_SECRET || env.ZOOM_CLIENT_SECRET.trim();

  rtmsSdk = loadRtmsSdk();
  log(
    `started — sdk=${rtmsSdk ? "loaded" : "NOT INSTALLED (sessions will be skipped; recording fallback covers them)"} ` +
      `poll=${POLL_MS}ms minConfidence=${MIN_CONFIDENCE} model=${EXTRACTION_MODEL}${SMOKE ? " [SMOKE]" : ""}`,
  );

  if (SMOKE) {
    await sweepJoinable();
    await sweepOrphanedLive();
    const counts = await db.zoomMeetingCapture.groupBy({
      by: ["status"],
      where: { source: "RTMS" },
      _count: { _all: true },
    });
    log(`smoke ok — RTMS rows by status: ${counts.map((c) => `${c.status}=${c._count._all}`).join(" ") || "none"}`);
    return;
  }

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`shutting down — leaving ${sessions.size} live session(s) for adoption on restart`);
    for (const s of sessions.values()) {
      if (s.pollTimer) clearInterval(s.pollTimer);
      try {
        s.client?.leave?.();
      } catch {
        /* noop */
      }
    }
    void db.$disconnect().finally(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Sequential loop (not setInterval) so slow passes never overlap.
  for (;;) {
    if (shuttingDown) return;
    try {
      await sweepJoinable();
      await sweepOrphanedLive();
      await tickSessions();
    } catch (err) {
      log(`loop error — ${err instanceof Error ? err.message : err}`);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error(`rtms-live failed: ${e instanceof Error ? e.message : e}`);
    await db.$disconnect();
    process.exit(1);
  });
