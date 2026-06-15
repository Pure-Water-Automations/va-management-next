import { action, optStr, str } from "@/lib/api";
import { submitSupervisorAssessment } from "@/lib/actions/evaluation";
import { parseScores, parseNarratives, parseRecommendation } from "@/lib/actions/assessment-parse";

export const POST = action(async ({ user, body }) => {
  return submitSupervisorAssessment(
    str(body, "evaluationId"),
    {
      scores: parseScores(body.scores),
      narratives: parseNarratives(body.narratives),
      portfolioUrl: optStr(body, "portfolioUrl"),
      recommendation: parseRecommendation(optStr(body, "recommendation")),
    },
    user.vaId ?? null,
    user.email,
    { isAdmin: user.isAdmin },
  );
});
