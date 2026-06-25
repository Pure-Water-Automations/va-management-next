"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const input: React.CSSProperties = {
  width: "100%", padding: "9px 11px", fontSize: 14, borderRadius: 6,
  border: "1px solid var(--color-border, #d8dee9)", background: "var(--color-surface, #fff)",
};
const label: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 };

export function NewClientOrgForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const effSlug = slugTouched ? slug : slugify(name);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/hr/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug: effSlug }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setError(typeof j?.error === "string" ? j.error : "Could not create the organization.");
        setBusy(false);
        return;
      }
      const org = (await res.json()) as { slug: string };
      router.push(`/hr/clients/${org.slug}`);
      router.refresh();
    } catch {
      setError("Could not create the organization.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <label htmlFor="org-name" style={label}>Organization name</label>
        <input id="org-name" style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Co." autoFocus required />
      </div>
      <div>
        <label htmlFor="org-slug" style={label}>URL slug</label>
        <input
          id="org-slug" style={input} value={effSlug}
          onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }}
          placeholder="acme-co" pattern="[a-z0-9-]+" required
        />
        <div style={{ fontSize: 12, color: "var(--color-text-tertiary, #8a93a3)", marginTop: 5 }}>
          Lowercase letters, numbers, and hyphens — auto-filled from the name.
        </div>
      </div>
      {error && <div style={{ fontSize: 13, color: "var(--color-error, #b5495b)" }}>{error}</div>}
      <div>
        <button type="submit" disabled={busy || !name.trim() || !effSlug} className="btn btn-primary">
          {busy ? "Creating…" : "Create organization"}
        </button>
      </div>
    </form>
  );
}
