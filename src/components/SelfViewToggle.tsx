"use client";

import { useRouter } from "next/navigation";

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=2592000; samesite=lax`;
}
function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

/**
 * Lets a non-admin user who is linked to a VA record switch between their
 * management console and their own VA console. No extra powers — just a view
 * flip via the `va_self_view` cookie.
 *
 * - mode "toManagement": shown in the VA chrome → clears the cookie + returns to
 *   the role home.
 * - mode "toVa": shown in the management chrome → sets the cookie + goes to /va.
 */
export function SelfViewToggle({
  mode,
  roleLabel,
  roleHome,
}: {
  mode: "toVa" | "toManagement";
  roleLabel: string;
  roleHome: string;
}) {
  const router = useRouter();

  function go() {
    if (mode === "toVa") {
      setCookie("va_self_view", "VA");
      router.push("/va");
    } else {
      clearCookie("va_self_view");
      router.push(roleHome);
    }
    router.refresh();
  }

  return (
    <div style={bar}>
      <button onClick={go} style={pill}>
        {mode === "toVa" ? "My VA view" : `← Back to ${roleLabel} console`}
      </button>
    </div>
  );
}

const bar: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
  padding: "8px 14px", background: "linear-gradient(90deg, var(--color-navy-900), var(--color-navy-800))",
  borderBottom: "1px solid rgba(255,255,255,.1)", position: "sticky", top: 0, zIndex: 30,
};
const pill: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,.2)", borderRadius: 999, padding: "4px 12px", cursor: "pointer",
  fontSize: "var(--text-sm)", fontWeight: 600,
  background: "rgba(255,255,255,.08)", color: "#fff",
};
