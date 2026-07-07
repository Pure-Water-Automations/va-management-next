import { getCurrentUser } from "@/lib/auth/access";
import { getClientMembership, assertClientRole } from "@/lib/auth/client";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ReadOnlyBlocks } from "@/components/hub/ReadOnlyBlocks";
import { parseStoredBlocks } from "@/lib/services/blocks";

/**
 * Read-only view of a PUBLISHED Library page (client portal "Shared with
 * you"). Only published Library docs are reachable — everything else 404s.
 */
export default async function ClientSharedDocPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  assertClientRole(user);
  const membership = await getClientMembership(user.id);
  if (!membership) redirect("/client/no-access");

  const page = await db.page.findFirst({
    where: { id, scope: "LIBRARY", published: true },
  });
  if (!page) notFound();

  return (
    <div>
      <Link
        href="/client/projects"
        style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)", fontWeight: "var(--weight-medium)" }}
      >
        ← Back
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "var(--space-3) 0 var(--space-4)" }}>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-2xl)",
            fontWeight: "var(--weight-bold)",
            color: "var(--color-text-primary)",
            margin: 0,
          }}
        >
          {page.title}
        </h1>
        <span
          style={{
            height: 20,
            padding: "0 9px",
            borderRadius: 999,
            background: "var(--color-success-light, #e6f9ef)",
            color: "var(--color-success-dark, #1d7a4c)",
            border: "1px solid rgba(48,201,122,.22)",
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          Published
        </span>
      </div>
      <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: 0 }}>
        Read-only · always the current version — no exported PDFs, no stale links
      </p>
      <Card padding="var(--space-6)">
        <ReadOnlyBlocks blocks={parseStoredBlocks(page.blocks)} />
      </Card>
    </div>
  );
}
