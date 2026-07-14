import { getRoles } from "@/lib/reads/hr-manage";
import { getCurrentUser, isAllAccess } from "@/lib/auth/access";
import { RolesManager, type RoleRow } from "@/components/RolesManager";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const [user, roles] = await Promise.all([getCurrentUser(), getRoles()]);
  const canEdit = user.role === "HR_MANAGER" || user.role === "PEOPLE_OPS" || isAllAccess(user);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">HR · Manage</div>
          <h1>Compensation roles</h1>
        </div>
        <span className="small">The ladder that drives pay + advancement</span>
      </div>

      <p className="small" style={{ marginBottom: 14, color: "var(--color-text-tertiary)" }}>
        {canEdit
          ? "Add or edit a tier to set its pay, advancement threshold, and delegation authority. Default delegators are Tier 3 (Senior VA) and Tier 4 (Lead)."
          : "Delegation authority controls which roles may hand off work. Default delegators are Tier 3 (Senior VA) and Tier 4 (Lead)."}
      </p>

      <RolesManager roles={roles as RoleRow[]} canEdit={canEdit} />
    </>
  );
}
