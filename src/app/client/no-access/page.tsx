export default function NoAccessPage() {
  return (
    <div style={{ maxWidth: 480, margin: "80px auto", textAlign: "center" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>Account not connected</h1>
      <p style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
        Your account has been set up but hasn&apos;t been connected to a client organization yet.
        Please contact your team to get access.
      </p>
    </div>
  );
}
