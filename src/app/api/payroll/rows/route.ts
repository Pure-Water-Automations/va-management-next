import type { Role } from "@prisma/client";
import { action, optStr, str } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { canApproveRow } from "@/lib/auth/payroll-approval";
import { db } from "@/lib/db";

const allow = (role: Role) =>
  ["BOOKKEEPER", "HR_MANAGER", "PEOPLE_OPS", "VA", "SENIOR_VA", "TEAM_LEAD"].includes(role);

type Actor = {
  email: string;
  isAdmin: boolean;
  role: Role;
  vaId: string | null;
};

const canReviewFlagged = (actor: Actor) =>
  actor.isAdmin || actor.role === "HR_MANAGER" || actor.role === "PEOPLE_OPS";

export const POST = action(
  async ({ user, body }) => {
    const op = str(body, "op");

    async function loadRow(id: string) {
      const row = await db.payrollCalculation.findUnique({
        where: { id },
        include: {
          period: { select: { status: true } },
          va: { select: { supervisorVaId: true } },
        },
      });
      if (!row) throw new Error("Row not found.");
      if (row.period.status !== "open") {
        throw new Error("Period is locked — reopen it to change rows.");
      }
      return { row, supervisorVaId: row.va.supervisorVaId ?? null };
    }

    switch (op) {
      case "approve": {
        const { row, supervisorVaId } = await loadRow(str(body, "id"));
        if (!canApproveRow(user, supervisorVaId)) {
          throw new Error("You can only approve your own reports' hours.");
        }
        if (row.flagged && !canReviewFlagged(user)) {
          throw new Error("Flagged rows need HR review before approval.");
        }

        const updated = await db.payrollCalculation.update({
          where: { id: row.id },
          data: {
            rowStatus: "approved",
            approvedByEmail: user.email,
            approvedAt: new Date(),
          },
        });
        await logActivity({
          source: "payroll_action",
          eventType: "row_approved",
          vaId: row.vaId,
          severity: "success",
          summary: `${row.name}'s payroll row approved by ${user.email}.`,
        });
        return updated;
      }

      case "unapprove": {
        const { row, supervisorVaId } = await loadRow(str(body, "id"));
        if (!canApproveRow(user, supervisorVaId)) throw new Error("Not your report.");

        const updated = await db.payrollCalculation.update({
          where: { id: row.id },
          data: {
            rowStatus: "submitted",
            approvedByEmail: null,
            approvedAt: null,
          },
        });
        await logActivity({
          source: "payroll_action",
          eventType: "row_unapproved",
          vaId: row.vaId,
          severity: "warning",
          summary: `${row.name}'s payroll approval was undone by ${user.email}.`,
        });
        return updated;
      }

      case "exclude": {
        if (!canReviewFlagged(user)) throw new Error("Only HR can exclude a row.");
        const { row } = await loadRow(str(body, "id"));
        const reason = optStr(body, "reason") ?? "Excluded by HR";

        const updated = await db.payrollCalculation.update({
          where: { id: row.id },
          data: {
            rowStatus: "excluded",
            excludedReason: reason,
            approvedByEmail: null,
            approvedAt: null,
          },
        });
        await logActivity({
          source: "payroll_action",
          eventType: "row_excluded",
          vaId: row.vaId,
          severity: "warning",
          summary: `${row.name}'s payroll row excluded by ${user.email}: ${reason}`,
        });
        return updated;
      }

      case "bulk_approve_trusted": {
        const period = await db.payrollPeriod.findFirst({
          where: { status: "open" },
          orderBy: { periodStart: "desc" },
        });
        if (!period) throw new Error("No open period.");

        const rows = await db.payrollCalculation.findMany({
          where: {
            periodStart: period.periodStart,
            rowStatus: "submitted",
            flagged: false,
          },
          select: { id: true, vaId: true },
        });
        const vas = await db.va.findMany({
          where: { vaId: { in: rows.map((row) => row.vaId) } },
          select: {
            vaId: true,
            supervisorVaId: true,
            trustedForBulkApprove: true,
          },
        });
        const meta = new Map(vas.map((va) => [va.vaId, va]));
        const eligibleIds = rows
          .filter((row) => {
            const va = meta.get(row.vaId);
            return !!va?.trustedForBulkApprove && canApproveRow(user, va.supervisorVaId ?? null);
          })
          .map((row) => row.id);

        const result =
          eligibleIds.length === 0
            ? { count: 0 }
            : await db.payrollCalculation.updateMany({
                where: {
                  id: { in: eligibleIds },
                  rowStatus: "submitted",
                  flagged: false,
                },
                data: {
                  rowStatus: "approved",
                  approvedByEmail: user.email,
                  approvedAt: new Date(),
                },
              });
        await logActivity({
          source: "payroll_action",
          eventType: "rows_bulk_approved",
          severity: "success",
          summary: `${result.count} trusted rows approved by ${user.email}`,
        });
        return { approved: result.count };
      }

      default:
        throw new Error(`Unknown op: ${op}`);
    }
  },
  { allow },
);
