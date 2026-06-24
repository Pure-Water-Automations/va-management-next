import { getCurrentUser } from "@/lib/auth/access";
import { getClientMembership, assertClientRole } from "@/lib/auth/client";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { NotionConnectForm } from "@/components/NotionConnectForm";
import { NotionHelp } from "@/components/NotionHelp";

export const dynamic = "force-dynamic";

export default async function ClientSettingsPage() {
  const user = await getCurrentUser();
  assertClientRole(user);
  const membership = await getClientMembership(user.id);
  if (!membership) redirect("/client/no-access");

  const org = membership.clientOrganization;
  const conn = await db.notionConnection.findUnique({
    where: { clientOrganizationId: org.id },
    select: {
      active: true,
      projectsDatabaseId: true,
      tasksDatabaseId: true,
      statusProperty: true,
      lastSyncedAt: true,
      lastSyncSummary: true,
    },
  });

  const isAdmin = user.role === "CLIENT_ADMIN";

  return (
    <div className="dash-stage" style={{ maxWidth: 640 }}>
      <h1 style={{ margin: "0 0 4px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-3xl)", letterSpacing: "-.03em", color: "var(--color-navy-900)" }}>
        Settings
      </h1>

      <div className="sec-head" style={{ marginTop: 24 }}>
        <h3 className="sec-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Notion sync
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#fff", background: "var(--color-sky-500, #2b8fd6)", padding: "2px 6px", borderRadius: 5 }}>
            Beta
          </span>
        </h3>
      </div>

      <div className="surface" style={{ padding: "20px 22px" }}>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", margin: "0 0 18px", lineHeight: 1.5 }}>
          Already run your projects and tasks in Notion? Connect your own Notion database and your team&apos;s status
          stays in sync both ways. Here&apos;s exactly how it works and how to set it up:
        </p>

        <div style={{ marginBottom: 22 }}>
          <NotionHelp audience="client" />
        </div>

        {isAdmin ? (
          <NotionConnectForm
            orgId={org.id}
            orgSlug={org.slug}
            state={{
              connected: !!conn?.active,
              projectsDatabaseId: conn?.projectsDatabaseId ?? null,
              tasksDatabaseId: conn?.tasksDatabaseId ?? null,
              statusProperty: conn?.statusProperty ?? null,
              lastSyncedAt: conn?.lastSyncedAt ? conn.lastSyncedAt.toISOString() : null,
              lastSyncSummary: (conn?.lastSyncSummary as Record<string, number> | null) ?? null,
            }}
          />
        ) : (
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)", margin: 0 }}>
            {conn?.active ? "Notion is connected for your team." : "Ask your account admin to connect Notion."}
          </p>
        )}
      </div>
    </div>
  );
}
