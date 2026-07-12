import { action } from "@/lib/api";
import { canManageTasks } from "@/lib/auth/roles";
import { saveWhiteboard } from "@/lib/actions/whiteboards";

// Autosave the canvas document (elements + links + view) and optional title rename.
export function POST(request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  return action(
    async ({ body }) => {
      const { boardId } = await params;
      return saveWhiteboard(
        boardId,
        body.data,
        typeof body.title === "string" ? body.title : undefined,
      );
    },
    { allow: (r) => canManageTasks(r) },
  )(request);
}
