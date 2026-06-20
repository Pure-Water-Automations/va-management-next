"use client";
import { useState } from "react";

/** Generic template editor with live HTML preview (used for the client agreement). */
export function AgreementTemplateEditor({
  initial,
  endpoint,
  tokens,
}: {
  initial: string;
  endpoint: string;
  tokens: string;
}) {
  const [html, setHtml] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  async function save() {
    setMsg("Saving…");
    const r = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ html }) });
    const j = await r.json().catch(() => ({ ok: false }));
    setMsg(j.ok ? "Saved." : `Error: ${j.error ?? "failed"}`);
  }
  return (
    <div className="editor-grid">
      <div>
        <textarea value={html} onChange={(e) => setHtml(e.target.value)} style={{ width: "100%", height: 420, fontFamily: "monospace", fontSize: 13 }} />
        <p className="small">Tokens: {tokens}</p>
        <button type="button" onClick={save}>Save template</button>
        {msg && <span style={{ marginLeft: 10 }}>{msg}</span>}
      </div>
      <div
        style={{ border: "1px solid #e3e3e3", borderRadius: 12, padding: 16, background: "#fff", overflow: "auto" }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
