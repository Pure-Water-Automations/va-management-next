import { action, optStr, str } from "@/lib/api";
import { isRecruiter } from "@/lib/auth/roles";
import { setStage } from "@/lib/actions/recruitment";

export const POST = action(
  async ({ body }) =>
    setStage(str(body, "candidateId"), str(body, "stage"), optStr(body, "note")),
  { allow: isRecruiter },
);
