// A fixed ribbon shown ONLY when the app runs with DEMO_MODE=1 (a seeded demo DB
// for screen-recording tutorials — see prisma/seed-demo.ts + AGENTS.md § Demo mode).
// Two jobs: (1) make it visually unmistakable that the data on screen is fake, so a
// demo instance can never be confused with production; (2) act as the recording
// tool's "am I pointed at the demo?" marker (tutorial-factory targets/va-manager.json
// preflight looks for the data-demo-banner attribute / the DEMO DATA text).
export function DemoBanner() {
  if (process.env.DEMO_MODE !== "1") return null;
  return (
    <div
      data-demo-banner="1"
      role="status"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 9999,
        width: "100%",
        background: "repeating-linear-gradient(45deg,#b45309,#b45309 12px,#92400e 12px,#92400e 24px)",
        color: "#fff",
        textAlign: "center",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.08em",
        padding: "4px 8px",
        textTransform: "uppercase",
      }}
    >
      Demo data — not real. This is a seeded demo environment for tutorials.
    </div>
  );
}
