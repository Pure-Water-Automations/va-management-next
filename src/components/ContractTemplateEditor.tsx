"use client";
import { useState } from "react";

export function ContractTemplateEditor({ initial }: { initial: string }) {
  const [html, setHtml] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  async function save() {
    setMsg("Saving…");
    const r = await fetch("/api/admin/contract-template", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ html }) });
    const j = await r.json().catch(() => ({ ok: false }));
    setMsg(j.ok ? "Saved." : `Error: ${j.error ?? "failed"}`);
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div>
        <textarea value={html} onChange={(e) => setHtml(e.target.value)} style={{ width: "100%", height: 420, fontFamily: "monospace", fontSize: 13 }} />
        <p className="small">Tokens: {"{{name}} {{role}} {{rate}} {{date}} {{deadline}} {{company}}"}</p>
        <button type="button" onClick={save}>Save template</button>
        {msg && <span style={{ marginLeft: 10 }}>{msg}</span>}
      </div>
      <div style={{ border: "1px solid #e3e3e3", borderRadius: 12, padding: 16, background: "#fff", overflow: "auto" }}
           dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
