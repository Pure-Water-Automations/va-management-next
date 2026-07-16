/** Zoom meeting lifecycle for discovery-call booking. */
import type { ZoomConnection } from "@prisma/client";

const ZOOM_API = "https://api.zoom.us/v2";

export type ZoomMeetingInput = {
  topic: string;
  startIso: string;
  durationMin: number;
  timezone: string;
};

export type ZoomMeeting = { id: string; joinUrl: string };

/** Pure Zoom request-body builder. */
export function buildMeetingBody(input: ZoomMeetingInput) {
  return {
    topic: input.topic,
    type: 2,
    start_time: input.startIso,
    duration: input.durationMin,
    timezone: input.timezone,
    settings: { join_before_host: true, waiting_room: false },
  };
}

/** Pure Zoom create-response parser. */
export function parseMeeting(json: unknown): ZoomMeeting {
  const value = json as { id?: string | number; join_url?: string } | null;
  if (value?.id === undefined || value.id === null || value.id === "") {
    throw new Error("Zoom meeting response is missing id");
  }
  if (!value.join_url) throw new Error("Zoom meeting response is missing join_url");
  return { id: String(value.id), joinUrl: value.join_url };
}

async function zoomFetch(auth: string, path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(`${ZOOM_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${auth}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  return response;
}

async function throwZoomError(response: Response, action: string): Promise<never> {
  const detail = (await response.text().catch(() => "")).slice(0, 500);
  throw new Error(`Zoom ${action} failed (${response.status})${detail ? `: ${detail}` : ""}`);
}

/** Create a scheduled Zoom meeting. */
export async function createZoomMeeting(auth: string, input: ZoomMeetingInput): Promise<ZoomMeeting> {
  const response = await zoomFetch(auth, "/users/me/meetings", {
    method: "POST",
    body: JSON.stringify(buildMeetingBody(input)),
  });
  if (!response.ok) return throwZoomError(response, "meeting create");
  return parseMeeting(await response.json());
}

/** Move an existing Zoom meeting and update its duration. */
export async function updateZoomMeetingTime(
  auth: string,
  meetingId: string,
  startIso: string,
  durationMin: number,
): Promise<void> {
  const response = await zoomFetch(auth, `/meetings/${encodeURIComponent(meetingId)}`, {
    method: "PATCH",
    body: JSON.stringify({ start_time: startIso, duration: durationMin }),
  });
  if (!response.ok) await throwZoomError(response, "meeting update");
}

/** Delete a Zoom meeting. Missing/already-deleted meetings are successful. */
export async function deleteZoomMeeting(auth: string, meetingId: string): Promise<void> {
  const response = await zoomFetch(auth, `/meetings/${encodeURIComponent(meetingId)}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) await throwZoomError(response, "meeting delete");
}

export type ResolvedDiscoveryZoom = { connection: ZoomConnection; auth: string };

/** Resolve the shared discovery-call host and ensure its token is fresh. */
export async function resolveDiscoveryZoom(): Promise<ResolvedDiscoveryZoom | null> {
  // Keep persistence/token dependencies lazy so the pure builders above can be
  // imported in isolation (tests and other tooling need no initialized client).
  const [{ db }, { accessTokenForHost }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/zoom/connection"),
  ]);
  // ponytail: single shared Zoom host; add repEmail-keyed connections if reps need host controls.
  const connection = await db.zoomConnection.findFirst({
    where: { active: true },
    orderBy: { createdAt: "asc" },
  });
  if (!connection) return null;
  try {
    const auth = await accessTokenForHost(connection.zoomUserId);
    return auth ? { connection, auth } : null;
  } catch {
    return null;
  }
}
