import type { DealStage } from "@prisma/client";
import { action, str, optStr, optNum } from "@/lib/api";
import { createDeal, setDealStage, convertDealToClient } from "@/lib/sales/deal";
import { sendClientAgreement } from "@/lib/sales/agreement";
import { markAgreementPaid } from "@/lib/sales/payment";

const allow = (role: string) => role === "HR_MANAGER" || role === "PEOPLE_OPS";

// One route, dispatched on `op`, for the internal sales surface. Admins bypass.
export const POST = action(
  async ({ body }) => {
    const op = str(body, "op");
    switch (op) {
      case "create_deal":
        return createDeal({
          orgName: str(body, "orgName"),
          contactName: optStr(body, "contactName"),
          contactEmail: optStr(body, "contactEmail"),
          source: optStr(body, "source"),
          accountOwnerEmail: optStr(body, "accountOwnerEmail"),
          stage: optStr(body, "stage") as DealStage | undefined,
          packageName: optStr(body, "packageName"),
          dealValue: optNum(body, "dealValue") ?? null,
          billingType: optStr(body, "billingType"),
          startDate: optStr(body, "startDate") ? new Date(str(body, "startDate")) : null,
          notionPageId: optStr(body, "notionPageId"),
        });
      case "set_stage":
        return setDealStage(str(body, "dealId"), str(body, "stage") as DealStage, optStr(body, "note"));
      case "send_agreement":
        return sendClientAgreement(str(body, "dealId"));
      case "mark_paid":
        return markAgreementPaid(str(body, "dealId"), { via: "manual" });
      case "convert":
        return convertDealToClient(str(body, "dealId"));
      default:
        throw new Error(`Unknown op: ${op}`);
    }
  },
  { allow },
);
