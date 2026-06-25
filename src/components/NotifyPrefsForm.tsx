"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";

type Option = { value: string; title: string; desc: string };

const OPTIONS: Option[] = [
  { value: "each", title: "Each task", desc: "An email every time a task is assigned to you." },
  { value: "digest", title: "Daily digest", desc: "One email a day summarizing your open & new tasks." },
  { value: "off", title: "In-app only", desc: "No emails — just the in-app bell." },
];

export function NotifyPrefsForm({ current }: { current: string }) {
  const router = useRouter();
  const [choice, setChoice] = useState(current);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function save() {
    setLoading(true);
    const res = await postAction("/api/va/notify-prefs", { notifyTasks: choice });
    setLoading(false);
    if (!res.ok) {
      window.alert(res.error ?? "Save failed");
      return;
    }
    setDone(true);
    router.refresh();
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        {OPTIONS.map((opt) => {
          const on = choice === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setChoice(opt.value);
                setDone(false);
              }}
              aria-pressed={on}
              style={{
                textAlign: "left",
                border: `1px solid ${on ? "var(--color-sky-500)" : "var(--color-border)"}`,
                borderRadius: "var(--radius-lg)",
                padding: "14px 16px",
                font: "inherit",
                cursor: "pointer",
                background: on ? "var(--color-sky-50, var(--color-surface))" : "var(--color-surface)",
                boxShadow: on ? "0 0 0 1px var(--color-sky-500)" : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  aria-hidden
                  style={{
                    width: 16,
                    height: 16,
                    flexShrink: 0,
                    borderRadius: 999,
                    border: `2px solid ${on ? "var(--color-sky-500)" : "var(--color-border)"}`,
                    background: on ? "var(--color-sky-500)" : "transparent",
                    boxShadow: on ? "inset 0 0 0 3px var(--color-surface)" : "none",
                  }}
                />
                <strong style={{ color: "var(--color-text-primary)" }}>{opt.title}</strong>
              </div>
              <div className="small" style={{ marginTop: 4, marginLeft: 26 }}>
                {opt.desc}
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Button onClick={save} loading={loading} disabled={loading} variant="primary">Save preferences</Button>
        {done ? <span className="small" style={{ color: "var(--color-success-dark)" }}>Saved ✓</span> : null}
      </div>
    </div>
  );
}
