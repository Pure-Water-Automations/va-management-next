/**
 * Recording transcription + summary via OpenRouter. We send compact audio (mono
 * 16kHz mp3, extracted by ffmpeg in worker/lib/media.ts) to a cheap multimodal
 * model (default google/gemini-2.5-flash-lite) using the OpenAI-compatible
 * `input_audio` content part, and ask for ONE JSON object with a timestamped
 * transcript + title + summary. Keeping the parse pure + node-free makes it unit
 * testable; the worker orchestrates ffmpeg + R2 around it.
 */
import { env } from "@/lib/env";

export type TranscriptSegment = { start: number; end: number; text: string };
export type TranscriptionResult = {
  title: string | null;
  summary: string | null;
  segments: TranscriptSegment[];
  text: string;
};

export type AudioFormat = "mp3" | "wav" | "ogg" | "m4a";

export const TRANSCRIBE_PROMPT =
  "You are given the audio track of a screen recording — a virtual assistant narrating their work. " +
  "Do two things: (1) transcribe the speech VERBATIM, split into short segments each with start/end times in seconds; " +
  "(2) write a concise title and a 2-4 sentence summary of what was shown or done. " +
  'Return ONLY a JSON object (no prose, no code fences): {"title":"<=8 words","summary":"2-4 sentences",' +
  '"segments":[{"start":<seconds>,"end":<seconds>,"text":"..."}]}. ' +
  'If there is no intelligible speech, return {"title":null,"summary":null,"segments":[]}.';

/** Robustly parse the model's JSON reply into a normalized result (or null if unusable). */
export function parseTranscription(raw: string): TranscriptionResult | null {
  if (!raw || typeof raw !== "string") return null;
  // Strip optional code fences, then fall back to the first {...} block.
  let cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      data = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  const segments: TranscriptSegment[] = Array.isArray(obj.segments)
    ? (obj.segments as unknown[])
        .map((s) => {
          const seg = (s ?? {}) as Record<string, unknown>;
          const rawStart = Number(seg.start);
          const rawEnd = Number(seg.end);
          const start = Number.isFinite(rawStart) ? Math.max(0, rawStart) : NaN;
          const end = Number.isFinite(rawEnd) ? Math.max(0, rawEnd) : start;
          return { start, end, text: String(seg.text ?? "").trim() };
        })
        .filter((s) => Number.isFinite(s.start) && s.text.length > 0)
        .sort((a, b) => a.start - b.start)
    : [];

  const explicitText = typeof obj.text === "string" ? obj.text.trim() : "";
  const text = explicitText || segments.map((s) => s.text).join(" ");
  const title =
    typeof obj.title === "string" && obj.title.trim() ? obj.title.trim().slice(0, 120) : null;
  const summary = typeof obj.summary === "string" && obj.summary.trim() ? obj.summary.trim() : null;

  // Nothing usable (e.g. the "no intelligible speech" case) → null so the caller marks failed/empty.
  if (!text && !summary && segments.length === 0) return null;
  return { title, summary, segments, text };
}

/** Send audio bytes to OpenRouter and return a parsed transcription. null if no key configured. */
export async function transcribeAudio(
  audio: Uint8Array | Buffer,
  format: AudioFormat = "mp3",
): Promise<TranscriptionResult | null> {
  if (!env.OPENROUTER_API_KEY) return null;
  const base = (env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const b64 = Buffer.from(audio).toString("base64");

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENROUTER_TRANSCRIBE_MODEL,
      temperature: 0,
      max_tokens: 8000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: TRANSCRIBE_PROMPT },
            { type: "input_audio", input_audio: { data: b64, format } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`transcribe ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) return null;
  return parseTranscription(raw);
}
