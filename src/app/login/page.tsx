"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginContent() {
  const params = useSearchParams();
  const denied = params.get("error") === "AccessDenied";

  return (
    <main style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600 }}>VA Management</h1>
      {denied && (
        <p style={{ color: "#b91c1c", fontSize: 14 }}>
          Your Google account isn&apos;t linked to an active account. Contact your admin.
        </p>
      )}
      <button
        onClick={() => signIn("google", { callbackUrl: "/" })}
        style={{ padding: "10px 24px", fontSize: 15, cursor: "pointer" }}
      >
        Sign in with Google
      </button>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
