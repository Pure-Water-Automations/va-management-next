import { action, optStr, str } from "@/lib/api";
import { submitSelfAssessment } from "@/lib/actions/evaluation";
import { parseScores, parseNarratives } from "@/lib/actions/assessment-parse";

export const POST = action(async ({ user, body }) => {
  return submitSelfAssessment(
    str(body, "evaluationId"),
    {
      scores: parseScores(body.scores),
      narratives: parseNarratives(body.narratives),
      portfolioUrl: optStr(body, "portfolioUrl"),
    },
    user.vaId ?? "",
    user.email,
    { isAdmin: user.isAdmin },
  );
});
