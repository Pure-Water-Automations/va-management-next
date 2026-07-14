import { redirect } from "next/navigation";
import { getCurrentUser, getEffectiveActor } from "@/lib/auth/access";
import { canUserDelegateTasks, canUserReviewMeetingActions } from "@/lib/auth/delegation";
import { db } from "@/lib/db";
import { matchAssignee } from "@/lib/services/meeting-actions";
import { MeetingActionsClient, type MeetingCard } from "@/components/MeetingActionsClient";

export const dynamic = "force-dynamic";

export default async function MeetingActionsPage() {
  const user = await getCurrentUser();
  const actor = await getEffectiveActor(user);
  // Meeting Actions review authority gates viewing the page (dedicated,
  // tier-configurable flag). `canConfirm` separately mirrors the exact check
  // createTask/confirmMeetingActionItem uses, so the ✓ Add button shows iff the
  // server will actually accept it — both act as the effective (possibly
  // impersonated) actor, matching the confirm/skip API routes.
  if (!(await canUserReviewMeetingActions(actor.id, actor.role))) redirect("/");
  const canConfirm = await canUserDelegateTasks(actor.id, actor.role);

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
          kind: true,
          confidence: true,
          evidenceQuote: true,
        },
      },
    },
  });

  // Assignable users for the dropdowns (active VAs + delegators).
  const assignees = await db.user.findMany({
    where: { active: true, role: { in: ["VA", "HR_MANAGER", "PEOPLE_OPS"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
  const nameList = assignees.map((a) => ({ id: a.id, name: a.name }));

  const cards: MeetingCard[] = meetings.map((m) => ({
    id: m.id,
    title: m.meetingTitle,
    date: m.meetingDate ? m.meetingDate.toISOString() : null,
    zoomAccount: m.zoomAccount,
    source: m.source,
    items: m.items.map((it) => ({
      id: it.id,
      title: it.title,
      description: it.description,
      clientContext: it.clientContext,
      suggestedAssignee: it.suggestedAssignee,
      suggestedDueDate: it.suggestedDueDate ? it.suggestedDueDate.toISOString().slice(0, 10) : null,
      matchedAssigneeId: matchAssignee(it.suggestedAssignee, nameList),
      kind: it.kind,
      confidence: it.confidence,
      evidenceQuote: it.evidenceQuote,
    })),
  }));

  return <MeetingActionsClient cards={cards} assignees={assignees} canConfirm={canConfirm} />;
}
