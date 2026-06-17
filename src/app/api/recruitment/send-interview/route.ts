import { action, str } from "@/lib/api";
import { sendInterviewInvite } from "@/lib/actions/recruitment";
import { isRecruiter } from "@/lib/auth/roles";

export const POST = action(
  async ({ user, body }) => sendInterviewInvite(str(body, "candidateId"), user.email),
  { allow: isRecruiter },
);
