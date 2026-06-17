import { action, str } from "@/lib/api";
import { deleteTrainingTask } from "@/lib/actions/training-tasks";
import { canDecideHire } from "@/lib/auth/roles";

export const POST = action(async ({ user, body }) => deleteTrainingTask(str(body, "id"), user.email), { allow: canDecideHire });
