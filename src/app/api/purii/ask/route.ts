import { action, str } from "@/lib/api";
import { askPurii } from "@/lib/purii";

// Any authenticated user can ask Purii for help (no role gate).
export const POST = action(async ({ user, body }) => askPurii(str(body, "question"), user.role));
