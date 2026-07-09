"use client";

import { useTransition, useState } from "react";
import {
  createUser,
  updateUserRole,
  updateUserName,
  setUserActive,
  setUserAdmin,
} from "@/lib/actions/users";
import type { Role } from "@prisma/client";

const ROLES: Role[] = [
  "HR_MANAGER",
  "PEOPLE_OPS",
  "TEAM_LEAD",
  "BOOKKEEPER",
  "RECRUITER",
  "SALES",
  "SENIOR_VA",
  "VA",
];

const ROLE_LABELS: Record<Role, string> = {
  HR_MANAGER: "HR Manager",
  PEOPLE_OPS: "People Ops",
  TEAM_LEAD: "Team Lead",
  BOOKKEEPER: "Bookkeeper",
  RECRUITER: "Recruiter",
  SALES: "Sales",
  SENIOR_VA: "Senior VA",
  VA: "VA",
  TESTER: "Tester",
  CLIENT_ADMIN: "Client Admin",
  CLIENT_MEMBER: "Client Member",
};

type User = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  isAdmin: boolean;
  active: boolean;
};

function RoleSelect({ id, current }: { id: string; current: Role }) {
  const [, startTransition] = useTransition();
  return (
    <select
      defaultValue={current}
      style={{ fontSize: "var(--text-sm)", padding: "2px 6px", borderRadius: 4, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)" }}
      onChange={(e) => {
        const role = e.target.value as Role;
        startTransition(() => updateUserRole(id, role));
      }}
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
      ))}
    </select>
  );
}

function NameCell({ id, name }: { id: string; name: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name ?? "");
  const [, startTransition] = useTransition();

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text)", textAlign: "left", padding: 0, fontSize: "var(--text-sm)" }}
        title="Click to edit"
      >
        {name ?? <span style={{ opacity: 0.4, fontStyle: "italic" }}>—</span>}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        setEditing(false);
        startTransition(() => updateUserName(id, value));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") { setValue(name ?? ""); setEditing(false); }
      }}
      style={{ fontSize: "var(--text-sm)", padding: "2px 6px", borderRadius: 4, border: "1px solid var(--color-primary)", width: 140 }}
    />
  );
}

function ToggleButton({
  active,
  onClick,
  labels,
}: {
  active: boolean;
  onClick: (next: boolean) => void;
  labels: [string, string];
}) {
  const [, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(() => onClick(!active))}
      style={{
        padding: "2px 10px",
        fontSize: "var(--text-xs)",
        borderRadius: 20,
        border: "none",
        cursor: "pointer",
        fontWeight: 600,
        background: active ? "var(--color-success)" : "var(--color-surface)",
        color: active ? "#fff" : "var(--color-text-subtle)",
        outline: active ? "none" : "1px solid var(--color-border)",
      }}
    >
      {active ? labels[0] : labels[1]}
    </button>
  );
}

function AddUserForm({ onDone }: { onDone: () => void }) {
  const [, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("VA");
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState("");

  function submit() {
    if (!email.trim()) { setError("Email is required"); return; }
    setError("");
    startTransition(async () => {
      try {
        await createUser({ email, name, role, isAdmin });
        onDone();
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <div style={{ marginTop: 24, padding: 16, background: "var(--color-surface-raised)", borderRadius: 8, border: "1px solid var(--color-border)" }}>
      <div style={{ fontWeight: 600, marginBottom: 12, fontSize: "var(--text-sm)" }}>Add user</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto auto", gap: 8, alignItems: "end" }}>
        <div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-subtle)", marginBottom: 4 }}>Email *</div>
          <input
            type="email"
            placeholder="aira@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: "6px 10px", fontSize: "var(--text-sm)", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)" }}
          />
        </div>
        <div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-subtle)", marginBottom: 4 }}>Name</div>
          <input
            type="text"
            placeholder="Aira"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: "100%", padding: "6px 10px", fontSize: "var(--text-sm)", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)" }}
          />
        </div>
        <div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-subtle)", marginBottom: 4 }}>Role</div>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            style={{ padding: "6px 10px", fontSize: "var(--text-sm)", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)" }}
          >
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-subtle)", marginBottom: 8 }}>Admin</div>
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} style={{ width: 16, height: 16 }} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={submit}
            style={{ padding: "6px 16px", borderRadius: 6, background: "var(--color-primary)", color: "#fff", border: "none", cursor: "pointer", fontSize: "var(--text-sm)", fontWeight: 600 }}
          >
            Add
          </button>
          <button
            onClick={onDone}
            style={{ padding: "6px 12px", borderRadius: 6, background: "none", border: "1px solid var(--color-border)", cursor: "pointer", fontSize: "var(--text-sm)" }}
          >
            Cancel
          </button>
        </div>
      </div>
      {error && <div style={{ marginTop: 8, color: "var(--color-error)", fontSize: "var(--text-sm)" }}>{error}</div>}
    </div>
  );
}

export function UserManagement({ users }: { users: User[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
              <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--color-text-subtle)", fontWeight: 600, fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Name</th>
              <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--color-text-subtle)", fontWeight: 600, fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Email</th>
              <th style={{ textAlign: "left", padding: "8px 12px", color: "var(--color-text-subtle)", fontWeight: 600, fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Role</th>
              <th style={{ textAlign: "center", padding: "8px 12px", color: "var(--color-text-subtle)", fontWeight: 600, fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Admin</th>
              <th style={{ textAlign: "center", padding: "8px 12px", color: "var(--color-text-subtle)", fontWeight: 600, fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} style={{ borderBottom: "1px solid var(--color-border-subtle)", opacity: u.active ? 1 : 0.5 }}>
                <td style={{ padding: "10px 12px" }}>
                  <NameCell id={u.id} name={u.name} />
                </td>
                <td style={{ padding: "10px 12px", color: "var(--color-text-subtle)" }}>{u.email}</td>
                <td style={{ padding: "10px 12px" }}>
                  <RoleSelect id={u.id} current={u.role} />
                </td>
                <td style={{ padding: "10px 12px", textAlign: "center" }}>
                  <ToggleButton
                    active={u.isAdmin}
                    onClick={(next) => startTransition(() => setUserAdmin(u.id, next))}
                    labels={["Admin", "Staff"]}
                  />
                </td>
                <td style={{ padding: "10px 12px", textAlign: "center" }}>
                  <ToggleButton
                    active={u.active}
                    onClick={(next) => startTransition(() => setUserActive(u.id, next))}
                    labels={["Active", "Inactive"]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd ? (
        <AddUserForm onDone={() => setShowAdd(false)} />
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          style={{ marginTop: 16, padding: "8px 16px", borderRadius: 6, border: "1px dashed var(--color-border)", background: "none", cursor: "pointer", fontSize: "var(--text-sm)", color: "var(--color-text-subtle)", width: "100%" }}
        >
          + Add user
        </button>
      )}
    </div>
  );
}
