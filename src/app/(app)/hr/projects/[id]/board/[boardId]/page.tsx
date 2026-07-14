import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { getWhiteboard } from "@/lib/reads/whiteboards";
import { getDelegationAssignees } from "@/lib/reads/assignees";
import { db } from "@/lib/db";
import { WhiteboardEditor, type WbDoc } from "@/components/whiteboard/WhiteboardEditor";

export const dynamic = "force-dynamic";

export default async function ProjectBoardPage({
  params,
}: {
  params: Promise<{ id: string; boardId: string }>;
}) {
  const { id, boardId } = await params;
  const user = await getCurrentUser();
  if (!user.caps.manageTasks) redirect("/hr/projects");

  const board = await getWhiteboard(boardId);
  // Guard against a boardId that belongs to a different project than the URL.
  if (!board || board.project.id !== id) notFound();

  const clientOrgId = (
    await db.project.findUnique({ where: { id }, select: { clientOrganizationId: true } })
  )?.clientOrganizationId ?? null;
  const assignees = await getDelegationAssignees(clientOrgId);

  return (
    <WhiteboardEditor
      boardId={board.id}
      projectId={board.project.id}
      projectName={board.project.name}
      initialTitle={board.title}
      initialData={(board.data as WbDoc | null) ?? null}
      assignees={assignees.map((a) => ({ id: a.id, name: a.name, email: a.email }))}
      currentUserName={user.name ?? user.email}
      currentUserId={user.id}
    />
  );
}
