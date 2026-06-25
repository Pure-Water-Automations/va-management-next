"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";

type State = {
  ok: true; name: string; company: string; deadline: string;
  contractHtml: string; alreadySigned: boolean; expired: boolean;
} | { ok: false; error: string };

async function post(path: string, body: Record<string, unknown>) {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false, error: "Bad response" }));
}

export function SignClient({ token }: { token: string }) {
  const [state, setState] = useState<State | null>(null);
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);

  useEffect(() => { post("/api/sign/state", { token }).then(setState); }, [token]);

  useEffect(() => {
    if (state?.ok && !state.alreadySigned && !state.expired && canvasRef.current && !padRef.current) {
      padRef.current = new SignaturePad(canvasRef.current, { penColor: "#0b3d63" });
    }
  }, [state]);

  const submit = useCallback(async () => {
    setBusy(true); setError(null);
    const signatureImage = padRef.current && !padRef.current.isEmpty() ? padRef.current.toDataURL("image/png") : null;
    const res = await post("/api/sign/submit", { token, signerName: name, signatureImage, agree });
    setBusy(false);
    if (res.ok) setDone(true); else setError(res.error || "Could not submit. Please try again.");
  }, [token, name, agree]);

  if (!state) return <Shell><p>Loading…</p></Shell>;
  if (!state.ok) return <Shell><h1>Link not valid</h1><p>{state.error}</p></Shell>;
  if (done || state.alreadySigned) return <Shell><h1>Thank you{state.ok ? `, ${state.name}` : ""} 🎉</h1><p>Your contract is signed. We'll be in touch about onboarding.</p></Shell>;
  if (state.expired) return <Shell><h1>This link has expired</h1><p>Please contact {state.company} to get a new signing link.</p></Shell>;

  return (
    <Shell>
      <h1>Your {state.company} contract</h1>
      <p style={{ color: "#666" }}>Please read, then sign at the bottom. Sign by {state.deadline}.</p>
      <style dangerouslySetInnerHTML={{ __html: ".contract-body,.contract-body p,.contract-body li{color:var(--color-text-primary)}.contract-body ul,.contract-body ol{padding-left:1.4em;margin:.5em 0}.contract-body li{margin:.25em 0}.contract-body li::marker{color:inherit}" }} />
      <div className="contract-body" style={{ border: "1px solid #e3e3e3", borderRadius: 12, padding: 24, background: "#fff", maxHeight: 420, overflow: "auto" }}
           dangerouslySetInnerHTML={{ __html: state.contractHtml }} />
      <div style={{ marginTop: 24 }}>
        <label style={{ display: "block", fontWeight: 500, marginBottom: 6 }}>Type your full legal name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ccc" }} />
      </div>
      <div style={{ marginTop: 16 }}>
        <label style={{ display: "block", fontWeight: 500, marginBottom: 6 }}>Draw your signature (optional)</label>
        <canvas ref={canvasRef} width={500} height={140} style={{ border: "1px solid #ccc", borderRadius: 8, width: "100%", touchAction: "none", background: "#fff" }} />
        <button type="button" onClick={() => padRef.current?.clear()} style={{ marginTop: 6, fontSize: 13 }}>Clear</button>
      </div>
      <label style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>I have read and agree to this contract.</span>
      </label>
      {error && <p style={{ color: "#c0392b" }}>{error}</p>}
      <button type="button" disabled={busy || !name.trim() || !agree} onClick={submit}
        style={{ marginTop: 20, padding: "12px 24px", borderRadius: 8, border: "none", background: name.trim() && agree ? "#0b3d63" : "#9bb", color: "#fff", fontWeight: 500 }}>
        {busy ? "Submitting…" : "Sign & submit"}
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px", fontFamily: "system-ui, sans-serif" }}>{children}</div>;
}
