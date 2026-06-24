"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";

const label: React.CSSProperties = {
  fontSize: "var(--text-xs)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--color-text-tertiary)",
  fontWeight: 700,
  display: "block",
  marginBottom: 4,
};
const input: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: "9px 11px",
  font: "inherit",
  fontSize: 13,
  background: "var(--color-surface, #fff)",
  width: "100%",
  boxSizing: "border-box",
};

export function WhatsAppSettingsForm({
  configured,
  phoneNumberId,
  templateName,
  templateLang,
  apiVersion,
}: {
  configured: boolean;
  phoneNumberId: string;
  templateName: string;
  templateLang: string;
  apiVersion: string;
}) {
  const router = useRouter();
  const [accessToken, setAccessToken] = useState("");
  const [pnid, setPnid] = useState(phoneNumberId);
  const [tmpl, setTmpl] = useState(templateName);
  const [lang, setLang] = useState(templateLang || "en_US");
  const [ver, setVer] = useState(apiVersion || "v21.0");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [testTo, setTestTo] = useState("");
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  async function save() {
    setErr(null);
    setSavedMsg(null);
    setSaving(true);
    const res = await postAction("/api/admin/whatsapp-config", {
      ...(accessToken.trim() ? { accessToken: accessToken.trim() } : {}),
      phoneNumberId: pnid.trim(),
      templateName: tmpl.trim(),
      templateLang: lang.trim(),
      apiVersion: ver.trim(),
    });
    setSaving(false);
    if (!res.ok) return setErr(res.error ?? "Save failed");
    setAccessToken("");
    setSavedMsg("Saved.");
    router.refresh();
  }

  async function sendTest() {
    setTestMsg(null);
    setTesting(true);
    const res = await postAction("/api/admin/whatsapp-test", { to: testTo.trim() });
    setTesting(false);
    setTestMsg(res.ok ? "✅ Sent — check WhatsApp." : `⚠️ ${res.error ?? "Failed"}`);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 520 }}>
      <div style={{ fontSize: 13, color: configured ? "var(--color-success-dark, #16794a)" : "var(--text-secondary)" }}>
        {configured ? "✓ Configured — WhatsApp notifications can send." : "Not configured yet — notifications fall back to email until this is set."}
      </div>

      <div>
        <label style={label}>Access token {configured && "(leave blank to keep current)"}</label>
        <input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="Meta WhatsApp permanent/system-user token" style={input} autoComplete="off" />
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
          From Meta → WhatsApp → API Setup (a permanent System User token for production).
        </div>
      </div>
      <div>
        <label style={label}>Phone number ID</label>
        <input value={pnid} onChange={(e) => setPnid(e.target.value)} placeholder="e.g. 123456789012345" style={input} />
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={label}>Template name (optional)</label>
          <input value={tmpl} onChange={(e) => setTmpl(e.target.value)} placeholder="blank = plain text" style={input} />
        </div>
        <div style={{ width: 110 }}>
          <label style={label}>Lang</label>
          <input value={lang} onChange={(e) => setLang(e.target.value)} placeholder="en_US" style={input} />
        </div>
        <div style={{ width: 90 }}>
          <label style={label}>API ver</label>
          <input value={ver} onChange={(e) => setVer(e.target.value)} placeholder="v21.0" style={input} />
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: -6 }}>
        Production business-initiated messages need an <strong>approved template</strong> — set its name + language here. Leave the
        name blank to send plain text (works in test mode / inside the 24-hour window).
      </div>

      {err && <div style={{ fontSize: 13, color: "var(--color-error-dark, #c0392b)" }}>{err}</div>}
      {savedMsg && <div style={{ fontSize: 13, color: "var(--color-success-dark, #16794a)" }}>{savedMsg}</div>}
      <div>
        <Button onClick={save} loading={saving} disabled={saving}>Save</Button>
      </div>

      <hr style={{ border: "none", borderTop: "1px solid var(--color-border-subtle)", margin: "4px 0" }} />

      <div>
        <label style={label}>Send a test message</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="+639171234567" style={{ ...input, maxWidth: 240 }} />
          <Button variant="secondary" onClick={sendTest} loading={testing} disabled={testing || !testTo.trim()}>Send test</Button>
        </div>
        {testMsg && <div style={{ fontSize: 13, marginTop: 8, color: "var(--text-secondary)" }}>{testMsg}</div>}
      </div>
    </div>
  );
}
