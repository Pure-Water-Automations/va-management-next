import { saveClientAgreementTemplate } from "@/lib/sales/agreement";
import { action, str } from "@/lib/api";

export const POST = action(async ({ body }) => saveClientAgreementTemplate(str(body, "html")), {
  allow: () => false, // admins bypass; non-admins blocked
});
