"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { InterviewForm } from "@/components/InterviewForm";

type Props = {
  candidateId: string;
  name: string | null;
  email: string;
  stage: string;
  hasVideoOrBookingLink: boolean;
  canRecruit: boolean;
  canDecide: boolean;
  canGate: boolean;
};

export function RecruiterWorkflow({ candidateId, name, email, stage, hasVideoOrBookingLink, canRecruit, canDecide, canGate }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [showInterview, setShowInterview] = useState(false);
  const who = name || email;

  async function run(key: string, path: string, body: Record<string, unknown>, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(key);
    const res = await postAction(path, { candidateId, ...body });
    setBusy("");
    if (!res.ok) { window.alert(res.error ?? "Action failed"); return; }
    router.refresh();
  }

  const Reject = canRecruit ? (
    <Button size="sm" variant="ghost" loading={busy === "reject"} onClick={() => run("reject", "/api/recruitment/set-stage", { stage: "closed" }, `Reject and close ${who}?`)}>Reject</Button>
  ) : null;

  const buttons: React.ReactNode[] = [];

  switch (stage) {
    case "applied":
      if (canRecruit) buttons.push(<Button key="rev" size="sm" variant="secondary" loading={busy === "rev"} onClick={() => run("rev", "/api/recruitment/set-stage", { stage: "reviewed" })}>Mark reviewed</Button>);
      buttons.push(Reject);
      break;
    case "reviewed":
      if (canRecruit) buttons.push(
        <Button
          key="inv"
          size="sm"
          variant="primary"
          loading={busy === "inv"}
          onClick={() => run("inv", "/api/recruitment/send-interview", {}, `Email the intro video + interview link to ${who}?`)}
        >
          ✉ Send interview invite
        </Button>,
      );
      buttons.push(Reject);
      break;
    case "interview_scheduled":
      if (canRecruit) buttons.push(<Button key="rec" size="sm" variant="secondary" onClick={() => setShowInterview((v) => !v)}>{showInterview ? "Close" : "Record interview"}</Button>);
      buttons.push(Reject);
      break;
    case "interviewed":
    case "decision":
      if (canDecide) {
        buttons.push(<Button key="t10" size="sm" variant="secondary" loading={busy === "t10"} onClick={() => run("t10", "/api/recruitment/decide", { decision: "invite_tenhr" }, `Recommend ${who} for the 10-hour trial? They go to the pre-trial review (Eunmi) before the trial starts — no link is sent yet.`)}>Recommend 10-hr</Button>);
        if (stage === "interviewed") buttons.push(<Button key="wl" size="sm" variant="ghost" loading={busy === "wl"} onClick={() => run("wl", "/api/recruitment/decide", { decision: "waitlist" })}>Waitlist</Button>);
        buttons.push(<Button key="rj" size="sm" variant="ghost" loading={busy === "rj"} onClick={() => run("rj", "/api/recruitment/decide", { decision: "reject" }, `Reject ${who}?`)}>Reject</Button>);
      }
      break;
    case "tenhr_invited":
    case "tenhr_in_progress":
      buttons.push(<a key="gate" href="/recruitment/gate" style={linkBtn}>Gate review →</a>);
      break;
    case "tenhr_pass":
      if (canGate) buttons.push(<Button key="cs" size="sm" variant="primary" loading={busy === "cs"} onClick={() => run("cs", "/api/recruitment/contract-sent", {}, `Mark the contract as sent to ${who}?`)}>Mark contract sent</Button>);
      break;
    case "contract_sent":
      if (canGate) buttons.push(<Button key="cg" size="sm" variant="primary" loading={busy === "cg"} onClick={() => run("cg", "/api/recruitment/contract-signed", {}, `Mark contract signed for ${who}? This provisions their VA record + onboarding.`)}>Mark contract signed</Button>);
      break;
    case "signed":
    case "onboarding":
      buttons.push(<a key="onb" href="/recruitment/onboarding" style={linkBtn}>Onboarding →</a>);
      break;
    default:
      break;
  }

  const visible = buttons.filter(Boolean);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      {stage === "reviewed" && !hasVideoOrBookingLink && (
        <span style={{ fontSize: "var(--text-2xs)", color: "var(--color-warning-dark, #8a5a00)" }}>Set an interview link above ↑</span>
      )}
      {visible.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>{visible}</div>}
      {showInterview && (
        <div style={{ width: 340 }}>
          <InterviewForm candidateId={candidateId} onDone={() => { setShowInterview(false); router.refresh(); }} />
        </div>
      )}
    </div>
  );
}

const linkBtn: React.CSSProperties = { fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-sky-600)", textDecoration: "none", border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", padding: "6px 12px" };
