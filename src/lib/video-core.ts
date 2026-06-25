/**
 * Minimal client for Video Core — the shared AI video-editing backend, deployed
 * loopback-only on this VPS at 127.0.0.1:3101. Zero-dep (uses fetch).
 *
 * `tightenVideo()` runs the full suggest → accept → render flow for a "tighten"
 * pass (remove filler words + long dead-air) and returns the rendered MP4 bytes.
 * The recording's source is passed as a public (presigned R2) URL so both Video
 * Core (ingest) and AssemblyAI (transcription) can fetch it. Auth is a per-app
 * `vc_` Bearer key. See ~/Documents/video-core/AGENTS.md.
 */
import { env } from "@/lib/env";

const baseUrl = (): string => (env.VIDEO_CORE_BASE_URL || "http://127.0.0.1:3101").replace(/\/+$/, "");

export function videoCoreConfigured(): boolean {
  return Boolean(env.VIDEO_CORE_API_KEY && env.VIDEO_CORE_WORKSPACE_ID);
}

function authHeaders(): Record<string, string> {
  if (!env.VIDEO_CORE_API_KEY) throw new Error("VIDEO_CORE_API_KEY not set");
  return { Authorization: `Bearer ${env.VIDEO_CORE_API_KEY}`, "Content-Type": "application/json" };
}

async function vc<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (json.message as string) || (json.error as string) || `HTTP ${res.status}`;
    throw new Error(`Video Core ${method} ${path} → ${res.status}: ${msg}`);
  }
  return json as T;
}

interface JobResponse {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  result: Record<string, unknown>;
  error: string | null;
}

async function waitForJob(jobId: string, timeoutMs = 900_000, intervalMs = 2500): Promise<JobResponse> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const job = await vc<JobResponse>("GET", `/jobs/${jobId}`);
    if (job.status === "done") return job;
    if (job.status === "failed") throw new Error(`Video Core job ${jobId} failed: ${job.error ?? "unknown error"}`);
    if (Date.now() >= deadline) throw new Error(`Video Core job ${jobId} timed out after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

export interface TightenResult {
  bytes: Buffer;
  durationMs: number | null;
  sizeBytes: number;
  stats: Record<string, unknown> | null;
}

/**
 * Run a full "tighten" pass (remove fillers + dead-air) on a video reachable at a
 * public URL. Returns the rendered MP4 bytes + cut stats. Throws on any stage
 * failure or timeout — callers should mark the recording failed and surface the message.
 */
export async function tightenVideo(
  sourceUrl: string,
  opts: { idempotencyKey: string; contentType?: string },
): Promise<TightenResult> {
  if (!videoCoreConfigured()) {
    throw new Error("Video Core is not configured (set VIDEO_CORE_API_KEY + VIDEO_CORE_WORKSPACE_ID).");
  }
  const idem = opts.idempotencyKey;

  const asset = await vc<{ asset_id: string }>("POST", "/assets", {
    workspace_id: env.VIDEO_CORE_WORKSPACE_ID,
    source_url: sourceUrl,
    content_type: opts.contentType ?? "video/mp4",
  });

  const analyze = await vc<{ job_id: string }>("POST", `/assets/${asset.asset_id}/analyze`, {
    detectors: ["filler", "silence"],
    idempotency_key: `${idem}-analyze`,
  });
  await waitForJob(analyze.job_id);

  const plan = await vc<{ id: string; cuts: { id: string }[] }>("GET", `/assets/${asset.asset_id}/edit-plan`);
  if (plan.cuts.length > 0) {
    // Auto-accept every suggested cut for an automatic tighten.
    await vc("PATCH", `/edit-plans/${plan.id}`, { accept: plan.cuts.map((c) => c.id) });
  }
  // Re-read so stats reflect the accepted cuts (suggest-first: pre-accept stats show cutMs:0).
  const planAfter = await vc<{ stats: Record<string, unknown> | null }>("GET", `/assets/${asset.asset_id}/edit-plan`);

  const render = await vc<{ job_id: string }>("POST", `/edit-plans/${plan.id}/render`, {
    idempotency_key: `${idem}-render`,
  });
  const done = await waitForJob(render.job_id);
  const roId = (done.result.render_output_id || done.result.renderOutputId) as string | undefined;
  if (!roId) throw new Error("Video Core render produced no render_output_id");

  const ro = await vc<{ download_url: string; durationMs: number | null }>("GET", `/render-outputs/${roId}`);
  // download_url is a signed loopback URL (auth-exempt via the sig token) — fetch directly.
  const fileRes = await fetch(ro.download_url);
  if (!fileRes.ok) throw new Error(`Video Core media download failed: ${fileRes.status}`);
  const bytes = Buffer.from(await fileRes.arrayBuffer());
  return { bytes, durationMs: ro.durationMs, sizeBytes: bytes.length, stats: planAfter.stats ?? null };
}
