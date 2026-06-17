import { saveContractTemplate } from "@/lib/actions/contract";
import { action, str } from "@/lib/api";

export const POST = action(async ({ body }) => saveContractTemplate(str(body, "html")), {
  allow: () => false, // admins bypass; non-admins blocked
});
