import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/access";
import { Card } from "@/components/ui/Card";
import { clientPortalRoutes } from "@/lib/client-portal/routes";

export const dynamic = "force-dynamic";

function canPreviewClientPortal(role: string, isAdmin: boolean): boolean {
  return isAdmin || role === "HR_MANAGER" || role === "PEOPLE_OPS" || role === "TEAM_LEAD";
}

export default async function NewClientTaskPreviewPage() {
  const user = await getCurrentUser();

  if (!canPreviewClientPortal(user.role, user.isAdmin)) {
    return <p style={{ padding: 32 }}>Client portal access is not enabled for this account yet.</p>;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            <a href={clientPortalRoutes.home}>Client Portal</a> / Delegate
          </div>
          <h1>Delegate a Task</h1>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            Preview of request-first intake. The production form should create a ClientTaskRequest, not an immediately assigned VA task.
          </p>
        </div>
      </div>

      <Card padding={20}>
        <form style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Task title">
            <input className="input" placeholder="What needs to be done?" disabled />
          </Field>

          <Field label="Desired outcome">
            <textarea className="input" rows={5} placeholder="Describe what success looks like..." disabled />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <Field label="Priority">
              <select className="input" disabled defaultValue="Medium">
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </Field>
            <Field label="Due date">
              <input className="input" type="date" disabled />
            </Field>
          </div>

          <Field label="Links or files">
            <input className="input" placeholder="Google Drive, Canva, website, source docs..." disabled />
          </Field>

          <label style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--color-text-secondary)" }}>
            <input type="checkbox" disabled />
            Needs my approval before final delivery
          </label>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
            <button className="btn" disabled type="button">Save draft</button>
            <button className="btn btn-primary" disabled type="button">Submit request</button>
          </div>
        </form>
      </Card>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--color-text-tertiary)", fontWeight: 700 }}>
        {label}
      </span>
      {children}
    </label>
  );
}
