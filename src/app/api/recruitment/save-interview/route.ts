import { action, optStr, str } from "@/lib/api";
import { saveInterview, type InterviewScores } from "@/lib/actions/recruitment";
import { isRecruiter } from "@/lib/auth/roles";

export const POST = action(
  async ({ user, body }) =>
    saveInterview(
      str(body, "candidateId"),
      readScores(body.scores),
      optStr(body, "notes"),
      str(body, "recommendation"),
      user.email,
    ),
  { allow: isRecruiter },
);

function readScores(value: unknown): InterviewScores {
  if (!isRecord(value)) throw new Error("Missing field: scores");
  return {
    comm: readScore(value, "comm"),
    reliability: readScore(value, "reliability"),
    ownership: readScore(value, "ownership"),
    skillFit: readScore(value, "skillFit"),
  };
}

function readScore(value: Record<string, unknown>, key: keyof InterviewScores): number {
  const raw = value[key];
  const score = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(score)) throw new Error(`Missing field: scores.${key}`);
  return score;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
