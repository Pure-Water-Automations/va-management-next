"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";

const sel: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  padding: "4px 6px",
  font: "inherit",
  fontSize: "var(--text-xs)",
  background: "var(--color-surface, #fff)",
  maxWidth: 150,
};
const inp: React.CSSProperties = { ...sel, maxWidth: 150 };

/** Per-VA notification channel + WhatsApp number, inline in the registry. HR-only. */
export function NotifyPrefsCell({ vaId, channel, number }: { vaId: string; channel: string; number: string | null }) {
  const router = useRouter();
  const [ch, setCh] = useState(channel || "both");
  const [num, setNum] = useState(number ?? "");
  const [saving, setSaving] = useState(false);

  async function save(body: Record<string, unknown>) {
    setSaving(true);
    const res = await postAction("/api/hr/set-va-notify", { vaId, ...body });
    setSaving(false);
    if (!res.ok) {
      window.alert(res.error ?? "Couldn't update notifications");
      return false;
    }
    router.refresh();
    return true;
  }

  const wantsWhatsApp = ch === "both" || ch === "whatsapp";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <select
        value={ch}
        disabled={saving}
        onChange={(e) => {
          setCh(e.target.value);
          void save({ notifyChannel: e.target.value });
        }}
        style={sel}
        aria-label="Notification channel"
      >
        <option value="both">Email + WhatsApp</option>
        <option value="email">Email only</option>
        <option value="whatsapp">WhatsApp only</option>
        <option value="none">Off</option>
      </select>
      {wantsWhatsApp && (
        <input
          value={num}
          disabled={saving}
          placeholder="+63917…"
          onChange={(e) => setNum(e.target.value)}
          onBlur={() => {
            if (num.trim() !== (number ?? "")) void save({ whatsappNumber: num.trim() });
          }}
          style={inp}
          aria-label="WhatsApp number"
        />
      )}
    </div>
  );
}
