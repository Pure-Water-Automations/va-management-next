import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { canManageProjects, canManageTasks } from "@/lib/auth/roles";
import { getPageTree, getPageDoc } from "@/lib/reads/pages";
import { PageTree } from "@/components/hub/PageTree";
import { BlockEditor } from "@/components/hub/BlockEditor";

export const dynamic = "force-dynamic";

/**
 * OS Hub Library (Sprint 1, Phase 4): the org-wide SOP/wiki tree. Same Page
 * model and editor as project hubs, scope LIBRARY. "Published" pages appear
 * read-only in the client portal's "Shared with you".
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: rawPage } = await searchParams;
  const user = await getCurrentUser();
  if (!user.isAdmin && !canManageTasks(user.role)) {
    redirect("/hr");
  }
  const canEdit = user.isAdmin || canManageTasks(user.role);
  const canShare = user.isAdmin || canManageProjects(user.role);

  const tree = await getPageTree("LIBRARY", null);
  const activePageId = rawPage && tree.some((n) => n.id === rawPage) ? rawPage : tree[0]?.id;
  const doc = activePageId ? await getPageDoc(activePageId) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Library</div>
          <h1>Library</h1>
          <span className="small" style={{ color: "var(--color-text-tertiary)" }}>
            SOPs and team docs — published pages show read-only in the client portal, always current
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "230px minmax(0, 1fr)", gap: 22, alignItems: "start" }}>
        <PageTree
          nodes={tree}
          activePageId={activePageId ?? ""}
          baseHref="/hr/library"
          projectId={null}
          canEdit={canEdit}
        />
        {doc ? (
          <BlockEditor
            key={doc.id}
            pageId={doc.id}
            title={doc.title}
            initialBlocks={doc.blocks}
            version={doc.version}
            canEdit={canEdit}
            projectId={null}
            meId={user.id}
            sharing={{ published: doc.published, clientVisible: doc.clientVisible }}
            canShare={canShare}
          />
        ) : (
          <p style={{ color: "var(--color-text-tertiary)", fontStyle: "italic", padding: 24 }}>
            No pages yet — create the first one from the left rail.
          </p>
        )}
      </div>
    </>
  );
}
