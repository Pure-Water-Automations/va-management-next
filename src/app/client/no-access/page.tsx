import { Card } from "@/components/ui/Card";

export default function NoAccessPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--color-bg-secondary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-6)",
      }}
    >
      <Card padding="var(--space-8)" style={{ maxWidth: 480, textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-xl)",
            fontWeight: "var(--weight-bold)",
            color: "var(--color-text-primary)",
            margin: "0 0 var(--space-3)",
          }}
        >
          Account not connected
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: "var(--text-sm)",
            lineHeight: "var(--leading-relaxed)",
            color: "var(--color-text-secondary)",
          }}
        >
          Your account has been set up but hasn&apos;t been connected to a client organization yet.
          Please contact your Pure Water Automations team to get access.
        </p>
      </Card>
    </div>
  );
}
