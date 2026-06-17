/**
 * ffmpeg helpers for the recordings worker. Kept out of src/lib (these use
 * node:child_process / node:fs) so the app bundle never imports them. We extract
 * a compact mono 16kHz mp3 audio track from the recorded video before sending it
 * to the transcription model — this is what keeps a 30-min recording well under
 * the model's request-size limits (a few MB instead of hundreds).
 *
 * Requires ffmpeg on the host (`apt install -y ffmpeg` on the VPS).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const exec = promisify(execFile);

/** Whether ffmpeg is callable on this host. */
export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await exec("ffmpeg", ["-version"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract a compact mono 16kHz 32kbps mp3 audio track from arbitrary video bytes.
 * Returns the mp3 bytes. Throws if ffmpeg fails (e.g. not installed → ENOENT).
 */
export async function extractAudioMp3(videoBytes: Uint8Array, ext = "webm"): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "rec-audio-"));
  const inPath = join(dir, `in.${ext}`);
  const outPath = join(dir, "out.mp3");
  try {
    await writeFile(inPath, videoBytes);
    await exec(
      "ffmpeg",
      ["-y", "-i", inPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", outPath],
      { maxBuffer: 1 << 26 },
    );
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
