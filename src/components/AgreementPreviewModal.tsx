"use client";

import { useEffect, useState } from "react";

type Summary = {
  client: string;
  contact: string;
  email: string;
  package: string;
  price: string;
  billing: string;
  startDate: string;
  deadline: string;
  company: string;
};

type Preview = { ok: true; alreadySent: boolean; summary: Summary; contractHtml: string };

async function call(body: Record<string, unknown>) {
  const r = await fetch("/api/hr/sales", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json().catch(() => ({ ok: false, error: "Bad response" }));
}

/**
 * Review-before-send gate for a client agreement. Fetches the rendered contract
 * + deal summary (read-only) and only emails it after an explicit confirm.
 */
export function AgreementPreviewModal({
  dealId,
  isResend,
  onClose,
  onSent,
}: {
  dealId: string;
  isResend: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    call({ op: "preview_agreement", dealId }).then((res) => {
      if (!active) return;
      if (res?.ok) setPreview(res as Preview);
      else setError(res?.error || "Could not load the agreement preview.");
    });
    return () => {
      active = false;
    };
  }, [dealId]);

  async function confirmSend() {
    setSending(true);
    setError(null);
    const res = await call({ op: "send_agreement", dealId });
    setSending(false);
    if (res?.ok) onSent();
    else setError(res?.error || "Failed to send the agreement.");
  }

  const s = preview?.summary;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        // Above the deal Drawer (zIndex 91) — the modal is always opened from
        // inside the open drawer, so it must sit on top of it, not behind.
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-surface, #fff)",
          color: "var(--color-text-primary, #111)",
          borderRadius: 12,
          boxShadow: "0 12px 40px rgba(15,23,42,0.25)",
          width: "min(720px, 100%)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border,#eee)" }}>
          <div style={{ fontWeight: 600, fontSize: 16 }}>Review agreement before sending</div>
          <div className="small" style={{ color: "var(--text-secondary,#666)" }}>
            Check the details below — nothing is sent until you confirm.
          </div>
        </div>

        <div style={{ padding: 20, overflowY: "auto" }}>
          {!preview && !error && <div className="small">Loading preview…</div>}
          {error && <div style={{ color: "#b91c1c", fontSize: 14 }}>{error}</div>}

          {s && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  rowGap: 6,
                  columnGap: 12,
                  fontSize: 14,
                  marginBottom: 16,
                }}
              >
                <Label>Client</Label>
                <span>{s.client}</span>
                {s.contact && (
                  <>
                    <Label>Contact</Label>
                    <span>{s.contact}</span>
                  </>
                )}
                <Label>Sending to</Label>
                <span style={{ fontWeight: 600 }}>{s.email || "—"}</span>
                <Label>Package</Label>
                <span>{s.package || "—"}</span>
                <Label>Price</Label>
                <span>{s.price || "—"}</span>
                <Label>Billing</Label>
                <span>{s.billing || "—"}</span>
                {s.startDate && (
                  <>
                    <Label>Start date</Label>
                    <span>{s.startDate}</span>
                  </>
                )}
                <Label>Sign by</Label>
                <span>{s.deadline || "—"}</span>
              </div>

              <details>
                <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--text-secondary,#666)", marginBottom: 8 }}>
                  Preview full contract
                </summary>
                <div
                  style={{
                    border: "1px solid var(--border,#eee)",
                    borderRadius: 8,
                    padding: 16,
                    fontSize: 13,
                    lineHeight: 1.5,
                    maxHeight: 320,
                    overflowY: "auto",
                    background: "var(--color-surface-muted, #fafafa)",
                  }}
                  dangerouslySetInnerHTML={{ __html: preview!.contractHtml }}
                />
              </details>
            </>
          )}
        </div>

        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid var(--border,#eee)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button type="button" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button type="button" onClick={confirmSend} disabled={!preview || sending || !s?.email}>
            {sending ? "Sending…" : isResend ? "Confirm & resend" : "Confirm & send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "var(--text-secondary,#666)" }}>{children}</span>;
}
