import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { canReviewMeetingActions } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { matchAssignee } from "@/lib/services/meeting-actions";
import { MeetingActionsClient, type MeetingCard } from "@/components/MeetingActionsClient";

export const dynamic = "force-dynamic";

export default async function MeetingActionsPage() {
  const user = await getCurrentUser();
  if (!user.isAdmin && !canReviewMeetingActions(user.role)) redirect("/");

  // Pending meetings (at least one pending item), newest first.
  const meetings = await db.meetingAction.findMany({
    where: { status: "PENDING", items: { some: { status: "PENDING" } } },
    orderBy: [{ meetingDate: "desc" }, { createdAt: "desc" }],
    include: {
      items: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          suggestedAssignee: true,
          suggestedDueDate: true,
          clientContext: true,
        },
      },
    },
  });

  // Assignable users for the dropdowns (active VAs + delegators).
  const assignees = await db.user.findMany({
    where: { active: true, role: { in: ["VA", "SENIOR_VA", "TEAM_LEAD", "HR_MANAGER", "PEOPLE_OPS"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
  const nameList = assignees.map((a) => ({ id: a.id, name: a.name }));

  const cards: MeetingCard[] = meetings.map((m) => ({
    id: m.id,
    title: m.meetingTitle,
    date: m.meetingDate ? m.meetingDate.toISOString() : null,
    zoomAccount: m.zoomAccount,
    items: m.items.map((it) => ({
      id: it.id,
      title: it.title,
      description: it.description,
      clientContext: it.clientContext,
      suggestedAssignee: it.suggestedAssignee,
      suggestedDueDate: it.suggestedDueDate ? it.suggestedDueDate.toISOString().slice(0, 10) : null,
      matchedAssigneeId: matchAssignee(it.suggestedAssignee, nameList),
    })),
  }));

  return <MeetingActionsClient cards={cards} assignees={assignees} />;
}
