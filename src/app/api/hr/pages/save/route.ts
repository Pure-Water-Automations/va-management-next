import { action, str, optNum } from "@/lib/api";
import { savePageBlocks } from "@/lib/actions/pages";

export const POST = action(async ({ user, body }) => {
  const version = optNum(body, "version");
  if (version === undefined) throw new Error("Missing field: version");
  return savePageBlocks(user.id, user.role, str(body, "pageId"), body.blocks, version);
});
