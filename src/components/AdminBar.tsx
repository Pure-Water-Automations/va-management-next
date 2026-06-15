"use client";

import { useRouter } from "next/navigation";

type View = "HR" | "PAYROLL" | "RECRUITMENT" | "VA";
const VIEWS: { key: View; label: string; home: string }[] = [
  { key: "HR", label: "HR", home: "/hr" },
  { key: "PAYROLL", label: "Payroll", home: "/payroll" },
  { key: "RECRUITMENT", label: "Recruitment", home: "/recruitment" },
  { key: "VA", label: "VA", home: "/va" },
];

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=2592000; samesite=lax`;
}

export function AdminBar({
  currentView,
  vas,
  currentVaId,
}: {
  currentView: View;
  vas: { vaId: string; name: string }[];
  currentVaId: string | null;
}) {
  const router = useRouter();

  function pick(v: View, home: string) {
    setCookie("va_view", v);
    router.push(home);
    router.refresh();
  }
  function impersonate(vaId: string) {
    setCookie("va_as_va", vaId);
    setCookie("va_view", "VA");
    router.push("/va");
    router.refresh();
  }

  return (
    <div style={bar}>
      <span style={tag}>ADMIN</span>
      <span style={{ color: "rgba(255,255,255,.75)", fontSize: "var(--text-xs)" }}>View as:</span>
      {VIEWS.map((v) => (
        <button key={v.key} onClick={() => pick(v.key, v.home)} style={pill(v.key === currentView)}>
          {v.label}
        </button>
      ))}
      {currentView === "VA" && vas.length > 0 && (
        <>
          <span style={{ color: "rgba(255,255,255,.55)", fontSize: "var(--text-xs)", marginLeft: 8 }}>as VA:</span>
          <select
            value={currentVaId ?? ""}
            onChange={(e) => impersonate(e.target.value)}
            style={select}
          >
            {vas.map((va) => (
              <option key={va.vaId} value={va.vaId}>{va.name}</option>
            ))}
          </select>
        </>
      )}
      <a href="/admin/email" style={{ marginLeft: "auto", color: "rgba(255,255,255,.75)", fontSize: "var(--text-xs)", textDecoration: "none" }}>⚙ Email sender</a>
    </div>
  );
}

const bar: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
  padding: "8px 14px", background: "linear-gradient(90deg, var(--color-navy-900), var(--color-navy-800))",
  borderBottom: "1px solid rgba(255,255,255,.1)", position: "sticky", top: 0, zIndex: 30,
};
const tag: React.CSSProperties = {
  fontSize: "var(--text-2xs)", fontWeight: 800, letterSpacing: ".12em", color: "var(--color-navy-900)",
  background: "var(--color-sky-400)", borderRadius: 4, padding: "2px 7px",
};
const pill = (active: boolean): React.CSSProperties => ({
  border: "1px solid rgba(255,255,255,.2)", borderRadius: 999, padding: "4px 12px", cursor: "pointer",
  fontSize: "var(--text-sm)", fontWeight: 600,
  background: active ? "var(--color-sky-400)" : "rgba(255,255,255,.08)",
  color: active ? "var(--color-navy-900)" : "#fff",
});
const select: React.CSSProperties = {
  background: "rgba(255,255,255,.1)", color: "#fff", border: "1px solid rgba(255,255,255,.2)",
  borderRadius: 6, padding: "4px 8px", fontSize: "var(--text-sm)",
};
