import { requireSalesUser } from "@/lib/auth/sales-guard";
import { loadSettings } from "@/lib/settings";
import { parseBookingConfig } from "@/lib/discovery-booking";
import { calendarConnections } from "@/lib/calendar-connection";
import { calendarOauthConfigured } from "@/lib/calendar-oauth";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, { text: string; variant: "success" | "danger" | "warning" }> = {
  connected: { text: "Google Calendar connected.", variant: "success" },
  not_configured: { text: "Per-rep connect isn't configured (GOOGLE_OAUTH_CLIENT_ID missing).", variant: "warning" },
  forbidden: { text: "You can only connect your own calendar.", variant: "danger" },
  bad_state: { text: "The connect link expired — please try again.", variant: "danger" },
  norefresh: { text: "Google didn't return a refresh token — remove app access and retry.", variant: "danger" },
  exchange_failed: { text: "Couldn't complete the Google connection.", variant: "danger" },
};

export default async function SalesCalendarPage({ searchParams }: { searchParams: Promise<{ calendar?: string }> }) {
  await requireSalesUser();

  const settings = await loadSettings();
  const reps = parseBookingConfig(settings.get("discovery_booking_windows"));
  const connections = await calendarConnections();
  const connByRep = new Map(connections.map((c) => [c.repEmail, c]));
  const configured = calendarOauthConfigured();
  const { calendar: msgKey } = await searchParams;
  const msg = msgKey ? MESSAGES[msgKey] : null;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Sales</div>
          <h1>Calendar connections</h1>
          <p className="small">
            Connect each rep&apos;s Google Calendar so the booking page hides their busy times and a real calendar event (with a
            Google Meet link) is created on booking. Reps without a connection still take bookings — availability falls back to
            in-app bookings only, with an emailed calendar invite.
          </p>
        </div>
      </div>

      {msg && (
        <div style={{ marginBottom: 16 }}>
          <Badge variant={msg.variant}>{msg.text}</Badge>
        </div>
      )}

      {!configured && (
        <Card>
          <p className="small" style={{ margin: 0 }}>
            Per-rep calendar connect is disabled here because <code>GOOGLE_OAUTH_CLIENT_ID</code> /{" "}
            <code>GOOGLE_OAUTH_CLIENT_SECRET</code> aren&apos;t set, and the redirect URI{" "}
            <code>{"{APP_BASE_URL}"}/api/calendar/oauth/callback</code> must be registered on the Google OAuth client.
            A rep seeded from the Workspace token still works.
          </p>
        </Card>
      )}

      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        {reps.length === 0 && (
          <Card><p className="small" style={{ margin: 0 }}>No booking reps configured yet (set <code>discovery_booking_windows</code>).</p></Card>
        )}
        {reps.map((rep) => {
          const conn = connByRep.get(rep.email.toLowerCase());
          return (
            <Card key={rep.email}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{rep.name || rep.email}</div>
                  <div className="small">{rep.email}</div>
                  {conn ? (
                    <div className="small" style={{ color: "var(--color-success-dark,#1a7a4a)" }}>
                      Connected{conn.email ? ` as ${conn.email}` : ""} · calendar “{conn.calendarId}”
                    </div>
                  ) : (
                    <div className="small" style={{ color: "var(--color-text-tertiary,#98989d)" }}>Not connected — using in-app availability + email invite</div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {conn ? <Badge variant="success">Connected</Badge> : <Badge variant="default">Not connected</Badge>}
                  {configured && (
                    <a
                      href={`/api/calendar/oauth/start?rep=${encodeURIComponent(rep.email)}&return=${encodeURIComponent("/sales/calendar")}`}
                      style={{ border: "1px solid var(--color-border,#d2d2d7)", borderRadius: 9999, padding: "7px 16px", fontWeight: 600, fontSize: 13, color: "var(--color-navy-900,#132272)", textDecoration: "none" }}
                    >
                      {conn ? "Reconnect" : "Connect Google Calendar"}
                    </a>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
