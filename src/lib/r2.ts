/**
 * Cloudflare R2 storage for in-app recordings. R2 is S3-compatible, so we use the
 * AWS SDK v3 pointed at the R2 endpoint. Browser uploads go directly to R2 via a
 * presigned PUT (bytes never pass through this server); playback is served through
 * a short-lived presigned GET (see the stream proxy route). All functions throw a
 * clear error if R2 isn't configured — callers should check `r2Configured()` first
 * and degrade gracefully (mirrors the rest of the codebase's best-effort pattern).
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

let _client: S3Client | null = null;

export function r2Configured(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET &&
      env.R2_ENDPOINT,
  );
}

export function r2(): S3Client {
  if (!r2Configured()) throw new Error("R2 is not configured (set R2_* env vars).");
  if (!_client) {
    _client = new S3Client({
      region: "auto",
      endpoint: env.R2_ENDPOINT!,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _client;
}

/** Presigned PUT URL for a direct browser upload. */
export async function presignUpload(
  key: string,
  contentType: string,
  expiresIn = 3600,
): Promise<string> {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({ Bucket: env.R2_BUCKET!, Key: key, ContentType: contentType }),
    { expiresIn },
  );
}

/** Presigned GET URL for playback/download. `downloadName` forces an attachment download. */
export async function presignDownload(
  key: string,
  expiresIn = 3600,
  downloadName?: string,
): Promise<string> {
  return getSignedUrl(
    r2(),
    new GetObjectCommand({
      Bucket: env.R2_BUCKET!,
      Key: key,
      ResponseContentDisposition: downloadName
        ? `attachment; filename="${downloadName.replace(/"/g, "")}"`
        : undefined,
    }),
    { expiresIn },
  );
}

export async function r2Delete(key: string): Promise<void> {
  await r2().send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET!, Key: key }));
}

/** Server-side fetch of an object's bytes (used by the transcription worker). */
export async function r2GetObject(key: string): Promise<Uint8Array> {
  const res = await r2().send(new GetObjectCommand({ Bucket: env.R2_BUCKET!, Key: key }));
  if (!res.Body) throw new Error(`R2 object has no body: ${key}`);
  // The SDK's stream exposes transformToByteArray() in Node and browsers.
  return (res.Body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
}

/** Server-side upload of bytes (used by the worker to store the transcript JSON). */
export async function r2Put(
  key: string,
  body: Uint8Array | Buffer | string,
  contentType: string,
): Promise<void> {
  await r2().send(
    new PutObjectCommand({ Bucket: env.R2_BUCKET!, Key: key, Body: body, ContentType: contentType }),
  );
}

// ── Object key helpers (one prefix per recording) ──────────────────────────
export function recordingKey(id: string): string {
  return `recordings/${id}/source.webm`;
}
export function thumbnailKey(id: string): string {
  return `recordings/${id}/thumb.jpg`;
}
export function transcriptKey(id: string): string {
  return `recordings/${id}/transcript.json`;
}
export function enhancedKey(id: string): string {
  return `recordings/${id}/enhanced.mp4`;
}
// One fixed key per VA — re-uploading a profile photo overwrites the old one, so
// there's no orphan cleanup; cache-bust on the client with a ?v= query param.
export function profilePhotoKey(vaId: string): string {
  return `profiles/${vaId}/photo`;
}
