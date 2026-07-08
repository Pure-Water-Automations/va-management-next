"use client";

/* eslint-disable @next/next/no-img-element */

import { useState, type CSSProperties, type ReactNode } from "react";
import { DiscoverClient } from "@/app/discover/DiscoverClient";
import { pkgByName } from "@/lib/sales/packages";

// ─────────────────────────────────────────────────────────────────────────
// PWA public marketing landing page (/home). Self-contained: all copy from
// the "PWA sales page" design export; keyframes + classes live in the
// <style> tag below. The hero form is the REAL /discover funnel embedded.
// ─────────────────────────────────────────────────────────────────────────

const SHOW_PRICING = true as const;

// Prices render from the package ladder (single source of truth) so the
// public page can never drift from what the agreement quotes.
const SPRING = pkgByName("Spring")!;
const STREAM = pkgByName("Stream")!;
const priceOf = (p: { price: number | null }) => `$${(p.price ?? 0).toLocaleString()}`;
const perOf = (p: { price: number | null; hours: number | null }) => `per month · ${p.hours} hours`;

type Props = { adminCostRate: number };

export function LandingPage({ adminCostRate }: Props) {
  const [calcHours, setCalcHours] = useState(12);
  const [faqOpen, setFaqOpen] = useState<number | null>(0);
  const yearly = Math.round(calcHours * adminCostRate * 52);

  return (
    <div className="pl">
      <style dangerouslySetInnerHTML={{ __html: LANDING_CSS }} />

      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <nav className="pl-nav">
        <img src="/pwa-logo.png" alt="Pure Water Automations" style={{ height: 34 }} />
        <div className="pl-nav-links">
          <a href="#how-b" className="pl-nav-link">How it works</a>
          <a href="#pricing-b" className="pl-nav-link">Pricing</a>
          <a href="#form-b" className="pl-btn pl-btn-primary">See If We&apos;re a Fit</a>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="pl-hero">
        <div className="pl-hero-glow" />
        <div className="pl-hero-grid">
          <div className="pl-hero-left">
            <span className="pl-tag">Operations support for mission-driven organizations</span>
            <h1 className="pl-h1">
              Get <span className="pwa-flow-text">10+ hours</span> of your week back.
            </h1>
            <p className="pl-hero-sub">
              A trained, supervised assistant plus clean systems — for nonprofits, ministries, and small teams
              drowning in admin.{SHOW_PRICING ? ` From ${priceOf(SPRING)}/month.` : ""}
            </p>
            <ul className="pl-bullets">
              <Bullet>Trained &amp; supervised assistants — not a directory</Bullet>
              <Bullet>Workflows documented as we go — you keep the system</Bullet>
              <Bullet>No long-term lock-in — 30 days&apos; notice, always</Bullet>
            </ul>
          </div>

          <div className="pl-form-card" id="form-b">
            <div className="pl-form-head">
              <span className="pl-form-title">See if we&apos;re a fit</span>
              <span className="pl-form-mins">3 min</span>
            </div>
            <DiscoverClient embedded adminCostRate={adminCostRate} bookingUrl={null} testimonial={null} />
          </div>
        </div>

        {/* Review badges */}
        <div className="pl-reviews">
          {[0, 1, 2].map((i) => (
            <div key={i} className="pl-review-card">
              <span className="pl-review-label">REVIEWED ON</span>
              <span className="pl-stars">★★★★★</span>
              <span className="pl-review-logo">Platform logo</span>
              <span className="pl-review-count">00 REVIEWS</span>
            </div>
          ))}
        </div>

        {/* Layered wave stack flowing into the navy stats band */}
        <div className="pwa-wave pwa-wave-sky" style={{ bottom: 34, height: 64, animation: "pwa-drift 26s linear infinite" }} />
        <div className="pwa-wave pwa-wave-teal" style={{ bottom: 16, height: 72, animation: "pwa-drift 18s linear infinite reverse" }} />
        <div className="pwa-wave pwa-wave-navy" style={{ bottom: -1, height: 80, animation: "pwa-drift 32s linear infinite" }} />
      </section>

      {/* ── Stats band ──────────────────────────────────────────────── */}
      <section className="pl-stats">
        <Bubbles count={6} />
        <div className="pl-stats-grid">
          <div className="pl-stat">
            <div className="pl-stat-num">18+ hrs</div>
            <div className="pl-stat-cap">reclaimed weekly by our founder on this system</div>
          </div>
          <div className="pl-stat">
            <div className="pl-stat-num">30–40%</div>
            <div className="pl-stat-cap">typical engagement lift once follow-up is consistent</div>
          </div>
          <div className="pl-stat">
            {SHOW_PRICING ? (
              <>
                <div className="pl-stat-num">{priceOf(SPRING)}/mo</div>
                <div className="pl-stat-cap">starting point — less than one weekend event</div>
              </>
            ) : (
              <>
                <div className="pl-stat-num">100%</div>
                <div className="pl-stat-cap">of engagements leave SOPs and systems behind</div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────── */}
      <section className="pl-how" id="how-b">
        <div className="pl-section-head">
          <h2 className="pl-h2">Four steps to a lighter week</h2>
          <p className="pl-section-sub">You can stop at any step. No work begins until you&apos;ve signed.</p>
        </div>
        <div className="pl-grid4" data-reveal>
          <HowStep n={1} title="Answer 14 questions">Three minutes, right on this page. We come prepared so the call is about you.</HowStep>
          <HowStep n={2} title="Discovery call">30–45 minutes to map where your time goes and what to delegate first.</HowStep>
          <HowStep n={3} title="Proposal & signature">A tailored package with clear scope, hours, and pricing. E-sign online.</HowStep>
          <HowStep n={4} title="Intake & kickoff" sky>A short intake form captures tools and priorities. Real tasks start in week one.</HowStep>
        </div>
      </section>

      {/* ── Supervised, not solo ────────────────────────────────────── */}
      <section className="pl-diff">
        <div className="pl-section-head">
          <h2 className="pl-h2">Supervised, not solo</h2>
          <p className="pl-section-sub" style={{ maxWidth: 520, margin: "0 auto" }}>
            Hiring a freelancer means becoming a manager. With PWA, support and oversight are built in.
          </p>
        </div>
        <div className="pl-grid4" data-reveal>
          <DiffCard icon="users" title="Team Leader oversight">Your assistant is supervised by an experienced Team Leader — quality is checked before it reaches you.</DiffCard>
          <DiffCard icon="file-text" title="You keep the system">Every workflow gets documented as an SOP. The knowledge stays with your organization, whatever happens.</DiffCard>
          <DiffCard icon="check-circle" title="Trained before you meet">Assistants complete PWA training and assessment before they&apos;re ever matched with a client.</DiffCard>
          <DiffCard icon="message-square" title="Weekly status updates">Every Friday: what was done, what&apos;s next, and what needs you. You always know where things stand.</DiffCard>
        </div>
      </section>

      {/* ── Vetting funnel ──────────────────────────────────────────── */}
      <section className="pl-vetting">
        <div className="pl-vetting-panel" data-reveal>
          <div>
            <h2 className="pl-h2" style={{ fontSize: 36, textAlign: "left" }}>How an assistant earns a place on your team</h2>
            <p style={{ fontSize: 15, color: "#48484a", lineHeight: 1.65, margin: "16px 0 0" }}>
              Every applicant is reviewed by a person — never an algorithm. Only a small fraction ever meet a
              client, and none before they&apos;ve been trained, assessed, and supervised on real work.
            </p>
            <p style={{ color: "#1e97be", fontWeight: 600, fontSize: 15, margin: "14px 0 0" }}>
              By the time you meet your assistant, they&apos;re ready.
            </p>
          </div>
          <div className="pl-funnel">
            <FunnelBar label="1 · Application & hand review" note="every applicant" width={100} fill="linear-gradient(90deg,#4dc4e8,#2ab0d8)" />
            <FunnelBar label="2 · Interview & English check" note="live, with our team" width={58} fill="linear-gradient(90deg,#2ab0d8,#1e97be)" />
            <FunnelBar label="3 · PWA training & assessment" note="must pass to continue" width={30} fill="linear-gradient(90deg,#1e97be,#22359e)" />
            <FunnelBar label="4 · Supervised trial, then matched to you" note="the few who make it" noteSky width={12} fill="linear-gradient(90deg,#22359e,#132272)" />
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────── */}
      <section className="pl-pricing" id="pricing-b">
        <div className="pl-section-head">
          <h2 className="pl-h2">Simple, honest pricing</h2>
          <p className="pl-section-sub">Month to month. Cancel with 30 days&apos; notice.</p>
        </div>
        <div className="pl-grid3 pl-pricing-grid" data-reveal>
          <PriceCard
            name="Spring"
            tagline="A steady start"
            price={SHOW_PRICING ? priceOf(SPRING) : "Let's talk"}
            per={SHOW_PRICING ? perOf(SPRING) : "discussed on your discovery call"}
            features={["Trained virtual assistant", "Email & calendar support", "Weekly status update"]}
          />
          <PriceCard
            featured
            name="Stream"
            tagline="Steady support"
            price={SHOW_PRICING ? priceOf(STREAM) : "Let's talk"}
            per={SHOW_PRICING ? perOf(STREAM) : "discussed on your discovery call"}
            features={["Everything in Spring", "Team Leader supervision", "SOPs documented as we go"]}
          />
          <PriceCard
            name="Custom"
            tagline="Built around you"
            price="Let's talk"
            per="scoped to your needs"
            features={["Multiple assistants", "Workflow automation", "Monthly systems review"]}
          />
        </div>
      </section>

      {/* ── Guarantee strip ─────────────────────────────────────────── */}
      <section className="pl-guarantee">
        <div className="pl-guarantee-card" data-reveal>
          <GuaranteeItem icon="shield" title="Free discovery call">
            A conversation, not a commitment. No card, no obligation — and you keep the time audit we do together.
          </GuaranteeItem>
          <GuaranteeItem icon="refresh" title="Right-fit promise">
            If your assistant isn&apos;t working out, we re-match you at no extra cost — and your SOPs make the
            handoff seamless.
          </GuaranteeItem>
          <GuaranteeItem icon="unlock" title="No lock-in">
            Month to month, cancel with 30 days&apos; notice. No work begins — and nothing is billed — until
            you&apos;ve signed.
          </GuaranteeItem>
        </div>
      </section>

      {/* ── Cost calculator ─────────────────────────────────────────── */}
      <section className="pl-calc-section">
        <div className="pl-calc" data-reveal>
          <div>
            <h3 className="pl-calc-title">You are the most valuable asset your mission has.</h3>
            <p style={{ fontSize: 15, color: "#48484a", lineHeight: 1.65, margin: "12px 0 22px" }}>
              Admin shouldn&apos;t be spending you. {calcHours} hours a week at a ${adminCostRate}/hr blended cost
              adds up fast.
            </p>
            <input
              className="pwa-range"
              type="range"
              min={1}
              max={30}
              value={calcHours}
              onChange={(e) => setCalcHours(Number(e.target.value))}
              aria-label="Admin hours per week"
            />
          </div>
          <div className="pl-calc-right">
            <div className="pl-calc-figure">${yearly.toLocaleString()}</div>
            <div style={{ fontSize: 13, color: "#98989d", margin: "4px 0 18px" }}>per year of your time</div>
            <a href="#form-b" className="pl-btn pl-btn-primary">Hand It Off</a>
          </div>
        </div>
      </section>

      {/* ── Testimonials + founders ─────────────────────────────────── */}
      <section className="pl-testimonials">
        <div className="pl-section-head">
          <h2 className="pl-h2">Hear it from leaders like you</h2>
          <p className="pl-section-sub">Short videos beat long promises.</p>
        </div>
        <div className="pl-grid3" data-reveal>
          {[0, 1, 2].map((i) => (
            <div key={i} className="pl-video-card">
              <div className="pl-video-thumb">
                <span className="pl-play">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden>
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              </div>
              <div className="pl-video-caption">
                <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, color: "#132272" }}>Client Name</div>
                <div style={{ fontSize: 13, color: "#98989d" }}>Organization · video testimonial slot</div>
              </div>
            </div>
          ))}
        </div>
        <div className="pl-quote-slot" data-reveal>
          <div className="pl-quote-photo" />
          <p style={{ fontStyle: "italic", color: "#98989d", fontSize: 16, margin: "14px 0 10px" }}>
            Testimonial slot — add a client quote about what changed after hand-off.
          </p>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: "#b5b5bb" }}>CLIENT NAME · ORGANIZATION</div>
        </div>
        <p className="pl-founders">
          Founded in 2025 by <strong>Justin Okamoto</strong> &amp; <strong>Eunmi Rangala</strong> — operations
          people who believe good systems should serve the mission, not the other way around.
        </p>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────── */}
      <section className="pl-faq">
        <div className="pl-section-head">
          <h2 className="pl-h2">Honest answers, up front</h2>
          <p className="pl-section-sub">The questions leaders actually ask us before they start.</p>
        </div>
        <div className="pl-faq-list" data-reveal>
          {FAQS.map((f, i) => (
            <div key={i} className={`pl-faq-item${faqOpen === i ? " open" : ""}`}>
              <button className="pl-faq-trigger" onClick={() => setFaqOpen((cur) => (cur === i ? null : i))} aria-expanded={faqOpen === i}>
                <span>{f.q}</span>
                <svg className="pl-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#98989d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {faqOpen === i && <p className="pl-faq-answer">{f.a}</p>}
            </div>
          ))}
        </div>
        <p style={{ textAlign: "center", fontSize: 14, color: "#98989d", marginTop: 26 }}>
          Something else on your mind? It&apos;s a good discovery-call question —{" "}
          <a href="#form-b" style={{ color: "#157ba0", fontWeight: 600 }}>start the questionnaire</a>.
        </p>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────── */}
      <section className="pl-cta">
        <div className="pwa-wave pwa-wave-top-light" style={{ top: 0, height: 64, animation: "pwa-drift 28s linear infinite" }} />
        <div className="pwa-wave pwa-wave-top-sky" style={{ top: 10, height: 58, animation: "pwa-drift 20s linear infinite reverse" }} />
        <Bubbles count={5} />
        <h2 className="pl-cta-h2">Ready to hand it off?</h2>
        <p className="pl-cta-sub">
          Three minutes of questions, one honest conversation, and a plan for getting your week back.
        </p>
        <a href="#form-b" className="pl-btn pl-btn-secondary">See If We&apos;re a Fit</a>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="pl-footer">
        <img src="/pwa-logo.png" alt="PWA" style={{ height: 28 }} />
        <span style={{ fontSize: 13, color: "#98989d" }}>Everything organized. Always within reach.</span>
        <span style={{ fontSize: 13, color: "#98989d" }}>© 2026 Pure Water Automations</span>
      </footer>
    </div>
  );
}

// ── Section pieces ───────────────────────────────────────────────────────

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2ab0d8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flex: "none", marginTop: 2 }}>
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span>{children}</span>
    </li>
  );
}

function HowStep({ n, title, sky, children }: { n: number; title: string; sky?: boolean; children: ReactNode }) {
  return (
    <div className="pl-how-card">
      <div className="pl-step-num" style={sky ? { background: "#4dc4e8" } : undefined}>{n}</div>
      <h3 className="pl-h3">{title}</h3>
      <p className="pl-card-body">{children}</p>
    </div>
  );
}

const ICONS: Record<string, ReactNode> = {
  users: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  "file-text": (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </>
  ),
  "check-circle": (
    <>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </>
  ),
  "message-square": <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  shield: (
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </>
  ),
  refresh: (
    <>
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </>
  ),
  unlock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </>
  ),
};

function IconChip({ icon, round }: { icon: string; round?: boolean }) {
  return (
    <span className="pl-icon-chip" style={round ? { borderRadius: 999 } : undefined}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2ab0d8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {ICONS[icon]}
      </svg>
    </span>
  );
}

function DiffCard({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="pl-diff-card">
      <IconChip icon={icon} />
      <h3 className="pl-h3" style={{ fontSize: 17 }}>{title}</h3>
      <p className="pl-card-body">{children}</p>
    </div>
  );
}

function FunnelBar({ label, note, noteSky, width, fill }: { label: string; note: string; noteSky?: boolean; width: number; fill: string }) {
  return (
    <div>
      <div className="pl-funnel-labels">
        <span style={{ fontSize: 14, fontWeight: 600, color: "#132272" }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: noteSky ? "#1e97be" : "#98989d" }}>{note}</span>
      </div>
      <div className="pl-funnel-track" data-reveal-bar>
        <div className="pl-funnel-fill" style={{ width: `${width}%`, background: fill }} />
      </div>
    </div>
  );
}

function PriceCard({ name, tagline, price, per, features, featured }: {
  name: string;
  tagline: string;
  price: string;
  per: string;
  features: string[];
  featured?: boolean;
}) {
  return (
    <div className={`pl-price-card${featured ? " featured" : ""}`}>
      {featured && <span className="pl-popular">MOST POPULAR</span>}
      <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, color: "#132272" }}>{name}</div>
      <div style={{ fontSize: 14, color: "#98989d", marginTop: 2 }}>{tagline}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 800, color: "#132272", marginTop: 16 }}>{price}</div>
      <div style={{ fontSize: 14, color: "#6e6e73", marginTop: 2 }}>{per}</div>
      <ul className="pl-price-features">
        {features.map((f) => (
          <li key={f}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2ab0d8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flex: "none", marginTop: 2 }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <a href="#form-b" className={`pl-btn ${featured ? "pl-btn-primary" : "pl-btn-ghost"}`} style={{ width: "100%", marginTop: "auto" }}>
        Check My Fit
      </a>
    </div>
  );
}

function GuaranteeItem({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      <IconChip icon={icon} round />
      <div>
        <h3 className="pl-h3" style={{ fontSize: 17, margin: 0 }}>{title}</h3>
        <p className="pl-card-body" style={{ marginTop: 6 }}>{children}</p>
      </div>
    </div>
  );
}

function Bubbles({ count }: { count: number }) {
  const specs: { left: string; size: number; dur: number; delay: number }[] = [
    { left: "8%", size: 10, dur: 11, delay: 0 },
    { left: "22%", size: 6, dur: 13, delay: 2.4 },
    { left: "41%", size: 12, dur: 9, delay: 1.2 },
    { left: "58%", size: 8, dur: 14, delay: 3.6 },
    { left: "76%", size: 14, dur: 10, delay: 0.8 },
    { left: "90%", size: 7, dur: 12, delay: 2 },
  ];
  return (
    <>
      {specs.slice(0, count).map((b, i) => (
        <span
          key={i}
          className="pl-bubble"
          style={{
            left: b.left,
            width: b.size,
            height: b.size,
            animation: `pwa-bubble ${b.dur}s linear ${b.delay}s infinite`,
          } as CSSProperties}
        />
      ))}
    </>
  );
}

// ── Copy ─────────────────────────────────────────────────────────────────

const FAQS: { q: string; a: string }[] = [
  {
    q: "Who will actually be working with us?",
    a: "A trained PWA assistant, matched to you after your discovery call — not pulled from a directory. You meet them at kickoff, and a Team Leader stays involved so you're never managing alone.",
  },
  {
    q: "What about sensitive ministry information?",
    a: "Every assistant signs a confidentiality agreement, and your data stays in your own accounts. Most clients start with lower-sensitivity tasks and expand as trust builds — we recommend it.",
  },
  {
    q: "What if our assistant isn't the right fit?",
    a: "Tell us and we'll re-match you at no extra cost. Because we document SOPs as we go, a new assistant picks up where the last one left off — no starting over.",
  },
  {
    q: "Do we have to manage them day to day?",
    a: "No. You set priorities; we handle the day-to-day. Team Leader supervision is built into Stream and above, and you get a weekly status update: what was done, what's next, and what needs you.",
  },
  {
    q: "How does billing work?",
    a: "Simple monthly packages, no setup fees. Nothing is billed until you've signed the agreement, and you can cancel with 30 days' notice.",
  },
  {
    q: "We're not 'systems people' — is that a problem?",
    a: "That's exactly who we serve. Every engagement leaves your organization more organized than we found it: SOPs, templates, and a clear operating hub you keep, whatever happens.",
  },
];

// ── CSS ──────────────────────────────────────────────────────────────────

function waveUri(fill: string, top = false): string {
  const path = top
    ? "M0,40 C240,72 480,8 720,40 C960,72 1200,8 1440,40 L1440,0 L0,0 Z"
    : "M0,40 C240,72 480,8 720,40 C960,72 1200,8 1440,40 L1440,80 L0,80 Z";
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 80' preserveAspectRatio='none'><path d='${path}' fill='${fill}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const LANDING_CSS = `
html{scroll-behavior:smooth}
.pl{font-family:var(--font-sans,'DM Sans',sans-serif);font-size:15px;color:#1d1d1f;background:#fff;-webkit-font-smoothing:antialiased;min-height:100vh}
.pl a{color:#157ba0}
.pl a:hover{opacity:.75}

/* Keyframes */
@keyframes pwa-flow{from{background-position:0% 50%}to{background-position:300% 50%}}
@keyframes pwa-drift{from{background-position-x:0}to{background-position-x:-1440px}}
@keyframes pwa-bubble{0%{transform:translateY(0) scale(.6);opacity:0}12%{opacity:.85}100%{transform:translateY(-460px) scale(1.2);opacity:0}}
@keyframes pwa-float{0%,100%{transform:translate(0,0)}50%{transform:translate(34px,-26px)}}
@keyframes pwa-fade-up{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
@keyframes pwa-reveal-up{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
@keyframes pwa-reveal-bar{from{transform:scaleX(0)}to{transform:scaleX(1)}}

.pwa-flow-text{background:linear-gradient(90deg,#4dc4e8,#2ab0d8,#6dd5f0,#22359e,#4dc4e8);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:pwa-flow 8s linear infinite}

.pwa-wave{position:absolute;left:0;right:0;background-repeat:repeat-x;background-size:1440px 100%;pointer-events:none}
.pwa-wave-sky{background-image:${waveUri("rgba(77,196,232,0.14)")}}
.pwa-wave-teal{background-image:${waveUri("rgba(42,176,216,0.18)")}}
.pwa-wave-navy{background-image:${waveUri("#132272")}}
.pwa-wave-top-light{background-image:${waveUri("#f5f5f7", true)}}
.pwa-wave-top-sky{background-image:${waveUri("rgba(77,196,232,0.18)", true)}}

/* Scroll reveal (progressive enhancement) */
@supports (animation-timeline: view()){
  .pl [data-reveal]{animation:pwa-reveal-up linear both;animation-timeline:view();animation-range:entry 10% entry 55%}
  .pl [data-reveal-bar] .pl-funnel-fill{animation:pwa-reveal-bar linear both;animation-timeline:view();animation-range:entry 15% entry 80%;transform-origin:left}
}
@media (prefers-reduced-motion: reduce){
  .pl *,.pl *::before,.pl *::after{animation:none!important;transition:none!important}
  .pl [data-reveal]{opacity:1!important;transform:none!important}
}

/* Buttons */
.pl-btn{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;font-weight:500;font-size:14px;line-height:1;text-decoration:none;cursor:pointer;border:none;transition:transform .25s cubic-bezier(.34,1.56,.64,1),box-shadow .25s ease}
.pl-btn:hover{opacity:1}
.pl-btn:active{transform:scale(.97)}
.pl-btn-primary{background:linear-gradient(180deg,#1a278a,#132272);color:#fff!important;border:1px solid rgba(255,255,255,.08);box-shadow:0 4px 12px rgba(19,34,114,.2);padding:12px 22px}
.pl-btn-primary:hover{transform:translateY(-1px) scale(1.015);box-shadow:0 8px 20px rgba(19,34,114,.32)}
.pl-btn-secondary{background:linear-gradient(180deg,#4dc4e8,#2ab0d8);color:#fff!important;padding:17px 36px;font-size:15px;font-weight:600;box-shadow:0 6px 18px rgba(77,196,232,.35)}
.pl-btn-secondary:hover{transform:translateY(-1px) scale(1.015);box-shadow:0 10px 26px rgba(77,196,232,.45)}
.pl-btn-ghost{background:transparent;color:#132272!important;border:1px solid #d2d2d7;padding:12px 22px}
.pl-btn-ghost:hover{background:#f5f5f7}

/* Nav */
.pl-nav{height:68px;background:#fff;border-bottom:1px solid #e8e8ed;padding:0 48px;display:flex;align-items:center;justify-content:space-between}
.pl-nav-links{display:flex;align-items:center;gap:32px}
.pl-nav-link{font-size:15px;font-weight:500;color:#1d1d1f!important;text-decoration:none}

/* Hero */
.pl-hero{position:relative;background:linear-gradient(180deg,#f5f5f7 0%,#ffffff 100%);padding:80px 48px 150px;overflow:hidden}
.pl-hero-glow{position:absolute;top:-160px;left:-160px;width:680px;height:680px;border-radius:50%;background:radial-gradient(circle, rgba(77,196,232,.12) 0%, transparent 65%);animation:pwa-float 12s ease-in-out infinite;pointer-events:none}
.pl-hero-grid{position:relative;max-width:1160px;margin:0 auto;display:grid;grid-template-columns:1fr 480px;gap:64px;align-items:center}
.pl-hero-left>*{animation:pwa-fade-up .7s cubic-bezier(.25,.46,.45,.94) both}
.pl-hero-left>*:nth-child(2){animation-delay:.12s}
.pl-hero-left>*:nth-child(n+3){animation-delay:.25s}
.pl-tag{display:inline-block;background:#eef0fa;color:#22359e;font-size:12px;font-weight:600;letter-spacing:.04em;padding:7px 14px;border-radius:999px}
.pl-h1{font-family:var(--font-display,'Outfit',sans-serif);font-size:60px;font-weight:800;line-height:1.04;letter-spacing:-.04em;color:#132272;margin:20px 0 0}
.pl-hero-sub{font-size:18px;color:#6e6e73;line-height:1.6;max-width:480px;margin:20px 0 0}
.pl-bullets{list-style:none;margin:24px 0 0;padding:0;display:flex;flex-direction:column;gap:12px}
.pl-bullets li{display:flex;gap:10px;align-items:flex-start;font-size:15px;color:#48484a}
.pl-form-card{background:#fff;border:1px solid #d2d2d7;border-radius:24px;padding:32px;box-shadow:0 20px 48px rgba(19,34,114,.14);scroll-margin-top:90px}
.pl-form-head{display:flex;align-items:center;justify-content:space-between}
.pl-form-title{font-family:var(--font-display,'Outfit',sans-serif);font-size:16px;font-weight:700;color:#132272}
.pl-form-mins{font-size:12px;font-weight:600;color:#98989d}

/* Review badges */
.pl-reviews{position:relative;display:flex;justify-content:center;flex-wrap:wrap;gap:18px;margin-top:56px;z-index:1}
.pl-review-card{display:flex;flex-direction:column;align-items:center;gap:4px;background:#fff;border:1px solid #e8e8ed;border-radius:16px;padding:14px 22px}
.pl-review-label{font-size:10px;font-weight:700;letter-spacing:.12em;color:#98989d}
.pl-stars{color:#ffb340;font-size:15px;letter-spacing:2px}
.pl-review-logo{width:92px;height:30px;border:1.5px dashed #b3bcec;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#98989d}
.pl-review-count{font-size:12px;font-weight:700;color:#132272}

/* Stats band */
.pl-stats{position:relative;background:#132272;padding:56px 48px;overflow:hidden}
.pl-bubble{position:absolute;bottom:-20px;border-radius:50%;background:rgba(77,196,232,.35);pointer-events:none}
.pl-stats-grid{position:relative;max-width:1120px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);text-align:center}
.pl-stat{padding:0 24px}
.pl-stat+.pl-stat{border-left:1px solid rgba(255,255,255,.12)}
.pl-stat-num{font-family:var(--font-display,'Outfit',sans-serif);font-size:44px;font-weight:800;color:#4dc4e8}
.pl-stat-cap{font-size:14px;color:rgba(255,255,255,.6);margin-top:6px}

/* Section scaffolding */
.pl-section-head{text-align:center;max-width:720px;margin:0 auto 44px}
.pl-h2{font-family:var(--font-display,'Outfit',sans-serif);font-size:42px;font-weight:700;letter-spacing:-.03em;color:#132272;margin:0}
.pl-section-sub{font-size:16px;color:#6e6e73;margin:12px 0 0}
.pl-h3{font-family:var(--font-display,'Outfit',sans-serif);font-size:18px;font-weight:600;color:#132272;margin:14px 0 0}
.pl-card-body{font-size:14px;color:#6e6e73;line-height:1.6;margin:8px 0 0}
.pl-grid4{max-width:1120px;margin:0 auto;display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.pl-grid3{max-width:1120px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:20px;align-items:stretch}

/* How it works */
.pl-how{background:#fff;padding:88px 48px}
.pl-how-card{background:#f5f5f7;border-radius:20px;padding:28px 24px}
.pl-step-num{width:36px;height:36px;border-radius:50%;background:#132272;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center}

/* Differentiator */
.pl-diff{background:#fff;padding:8px 48px 88px}
.pl-diff-card{background:#fff;border:1px solid #e8e8ed;border-radius:20px;padding:26px 24px}
.pl-icon-chip{width:44px;height:44px;border-radius:12px;background:#e7f8fd;display:inline-flex;align-items:center;justify-content:center;flex:none}

/* Vetting funnel */
.pl-vetting{background:#fff;padding:0 48px 96px}
.pl-vetting-panel{max-width:1120px;margin:0 auto;background:#eef0fa;border-radius:24px;padding:56px 60px;display:grid;grid-template-columns:1fr 1.1fr;gap:64px;align-items:center}
.pl-funnel{display:flex;flex-direction:column;gap:14px}
.pl-funnel-labels{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:6px}
.pl-funnel-track{height:14px}
.pl-funnel-fill{height:14px;border-radius:999px}

/* Pricing */
.pl-pricing{background:#f5f5f7;padding:88px 48px}
.pl-price-card{position:relative;background:#fff;border:1px solid #d2d2d7;border-radius:24px;padding:36px 32px;display:flex;flex-direction:column;box-shadow:0 4px 14px rgba(19,34,114,.06)}
.pl-price-card.featured{border:2px solid #4dc4e8;box-shadow:0 12px 32px rgba(77,196,232,.22);transform:translateY(-10px)}
.pl-popular{position:absolute;top:0;left:50%;transform:translate(-50%,-50%);background:linear-gradient(180deg,#4dc4e8,#2ab0d8);color:#fff;font-size:12px;font-weight:600;letter-spacing:.08em;padding:6px 16px;border-radius:999px;white-space:nowrap}
.pl-price-features{list-style:none;margin:22px 0 26px;padding:0;display:flex;flex-direction:column;gap:10px}
.pl-price-features li{display:flex;gap:10px;align-items:flex-start;font-size:15px;color:#48484a}

/* Guarantee */
.pl-guarantee{background:#f5f5f7;padding:0 48px 88px}
.pl-guarantee-card{max-width:1120px;margin:0 auto;background:#fff;border:1px solid #d2d2d7;border-radius:24px;padding:40px 44px;display:grid;grid-template-columns:repeat(3,1fr);gap:36px}

/* Calculator */
.pl-calc-section{background:#fff;padding:72px 48px}
.pl-calc{max-width:960px;margin:0 auto;background:#eef0fa;border-radius:24px;padding:44px 48px;display:grid;grid-template-columns:1fr auto;gap:48px;align-items:center}
.pl-calc-title{font-family:var(--font-display,'Outfit',sans-serif);font-size:26px;font-weight:700;color:#132272;margin:0;letter-spacing:-.02em}
.pl-calc-right{text-align:center}
.pl-calc-figure{font-family:var(--font-display,'Outfit',sans-serif);font-size:52px;font-weight:800;color:#132272;letter-spacing:-.03em}
.pwa-range{-webkit-appearance:none;appearance:none;width:100%;max-width:360px;height:6px;border-radius:999px;background:#d5daf4;outline:none;cursor:pointer}
.pwa-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:26px;height:26px;border-radius:50%;background:linear-gradient(180deg,#4dc4e8,#2ab0d8);border:3px solid #fff;box-shadow:0 2px 12px rgba(77,196,232,.55);cursor:pointer}
.pwa-range::-moz-range-thumb{width:26px;height:26px;border-radius:50%;background:linear-gradient(180deg,#4dc4e8,#2ab0d8);border:3px solid #fff;box-shadow:0 2px 12px rgba(77,196,232,.55);cursor:pointer}

/* Testimonials */
.pl-testimonials{background:#fff;padding:8px 48px 80px}
.pl-video-card{background:#fff;border:1px solid #d2d2d7;border-radius:20px;overflow:hidden}
.pl-video-thumb{position:relative;aspect-ratio:16/9;background:linear-gradient(150deg,#eef0fa,#d5daf4);display:flex;align-items:center;justify-content:center}
.pl-play{width:54px;height:54px;border-radius:50%;background:rgba(19,34,114,.85);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 24px rgba(19,34,114,.4);padding-left:4px}
.pl-video-caption{padding:16px 20px}
.pl-quote-slot{max-width:760px;margin:44px auto 0;border:1.5px dashed #b3bcec;border-radius:24px;padding:36px 40px;text-align:center}
.pl-quote-photo{width:64px;height:64px;border-radius:50%;border:1.5px dashed #b3bcec;background:#f5f5f7;margin:0 auto}
.pl-founders{max-width:760px;margin:40px auto 0;text-align:center;font-size:14px;color:#98989d}
.pl-founders strong{color:#48484a}

/* FAQ */
.pl-faq{background:#f5f5f7;padding:88px 48px}
.pl-faq-list{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
.pl-faq-item{background:#fff;border:1px solid #d2d2d7;border-radius:16px;overflow:hidden}
.pl-faq-trigger{width:100%;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 24px;background:none;border:none;cursor:pointer;text-align:left;font-family:var(--font-display,'Outfit',sans-serif);font-size:17px;font-weight:600;color:#132272}
.pl-chevron{flex:none;transition:transform .24s ease}
.pl-faq-item.open .pl-chevron{transform:rotate(180deg)}
.pl-faq-answer{font-size:15px;color:#6e6e73;line-height:1.65;margin:0;padding:0 24px 20px}

/* Final CTA */
.pl-cta{position:relative;background:#132272;padding:130px 48px 90px;text-align:center;overflow:hidden}
.pl-cta-h2{font-family:var(--font-display,'Outfit',sans-serif);font-size:44px;font-weight:800;letter-spacing:-.035em;color:#fff;margin:0}
.pl-cta-sub{font-size:16px;color:rgba(255,255,255,.6);max-width:440px;margin:16px auto 30px}

/* Footer */
.pl-footer{background:#f5f5f7;border-top:1px solid #d2d2d7;padding:32px 48px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}

/* Responsive (the export was desktop-only; sane stacking below ~980px) */
@media (max-width: 980px){
  .pl-nav{padding:0 20px}
  .pl-nav-links{gap:16px}
  .pl-hero{padding:48px 20px 130px}
  .pl-hero-grid{grid-template-columns:1fr;gap:40px}
  .pl-h1{font-size:42px}
  .pl-grid4,.pl-grid3,.pl-guarantee-card{grid-template-columns:1fr}
  .pl-vetting-panel{grid-template-columns:1fr;gap:36px;padding:36px 28px}
  .pl-calc{grid-template-columns:1fr;gap:28px;padding:32px 24px}
  .pl-stats-grid{grid-template-columns:1fr;gap:28px}
  .pl-stat+.pl-stat{border-left:none;border-top:1px solid rgba(255,255,255,.12);padding-top:28px}
  .pl-price-card.featured{transform:none}
  .pl-h2{font-size:32px}
  .pl-cta-h2{font-size:34px}
  .pl-how,.pl-pricing,.pl-faq{padding:64px 20px}
  .pl-diff{padding:8px 20px 64px}
  .pl-vetting{padding:0 20px 72px}
  .pl-guarantee{padding:0 20px 64px}
  .pl-calc-section,.pl-testimonials{padding:48px 20px}
  .pl-cta{padding:110px 20px 72px}
  .pl-footer{justify-content:center;text-align:center}
}
`;
