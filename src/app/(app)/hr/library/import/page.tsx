import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, isFounder } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { NotionImportForm } from "@/components/hub/NotionImportForm";

export const dynamic = "force-dynamic";

/** Founder-only Notion importer (Phase 4.6) — the Aug-15 cutover accelerator. */
export default async function NotionImportPage() {
  const user = await getCurrentUser();
  if (!isFounder(user.email)) redirect("/hr/library");

  const projects = await db.project.findMany({
    where: { status: { in: ["Planning", "Active"] } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true },
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            <Link href="/hr/library">Library</Link> / Import
          </div>
          <h1>Import from Notion</h1>
          <span className="small" style={{ color: "var(--color-text-tertiary)" }}>
            Migrate project docs and SOPs into the hub — paste a page, get live hub pages
          </span>
        </div>
      </div>
      <NotionImportForm projects={projects} />
    </>
  );
}
