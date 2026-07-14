import { getCurrentUser } from "@/lib/auth/access";
import { getDirectory } from "@/lib/reads/directory";
import { loadSettings, str } from "@/lib/settings";
import { isBirthdayToday, birthdayLabel, DEFAULT_BIRTHDAY_TZ } from "@/lib/birthdays";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/ui/Card";

export const dynamic = "force-dynamic";

// A VA's card shows their TIER (seniority), matching the console pill.
const TIER_LABEL: Record<string, string> = {
  TRAINEE: "Trainee",
  TIER_1: "Tier 1 VA",
  TIER_2: "Tier 2 VA",
  TIER_3: "Senior VA",
  TIER_4: "Lead VA",
};

function localTime(tz: string): string | null {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date());
  } catch {
    return null;
  }
}

export default async function DirectoryPage() {
  await getCurrentUser(); // any authenticated console user may browse the team
  const [vas, settings] = await Promise.all([getDirectory(), loadSettings()]);
  const tz = str(settings, "birthday_timezone", DEFAULT_BIRTHDAY_TZ);
  const now = new Date();

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Team</div>
          <h1>Team directory</h1>
          <p className="small">
            {vas.length} teammates — add your own photo and details on your profile page.
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {vas.map((va) => {
          const birthdayToday = isBirthdayToday(va.birthdayMonth, va.birthdayDay, now, tz);
          const time = va.timezone ? localTime(va.timezone) : null;
          const skills = (va.skillSpecs ?? "")
            .split(/[,;\n]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 6);
          return (
            <Card key={va.vaId} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar
                  name={va.name}
                  size={56}
                  src={va.photoKey ? `/api/people/photo/${va.vaId}?v=${va.updatedAt.getTime()}` : null}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{va.name}</span>
                    {birthdayToday ? <span title="Birthday today!">🎂</span> : null}
                  </div>
                  <div className="small" style={{ color: "var(--color-text-tertiary)" }}>
                    {TIER_LABEL[va.compensationRole] ?? "Virtual Assistant"}
                    {va.status === "training" ? " · In training" : ""}
                  </div>
                </div>
              </div>

              {va.bio ? (
                <p className="small" style={{ margin: 0 }}>{va.bio}</p>
              ) : null}

              <div className="small" style={{ color: "var(--color-text-tertiary)", display: "flex", flexDirection: "column", gap: 2 }}>
                {va.location ? <span>📍 {va.location}</span> : null}
                {va.timezone ? (
                  <span>🕐 {va.timezone.replace(/_/g, " ")}{time ? ` — ${time} now` : ""}</span>
                ) : null}
                {va.birthdayMonth && va.birthdayDay ? (
                  <span>🎂 {birthdayLabel(va.birthdayMonth, va.birthdayDay)}</span>
                ) : null}
              </div>

              {skills.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {skills.map((s) => (
                    <span
                      key={s}
                      className="small"
                      style={{
                        border: "1px solid var(--color-border)",
                        borderRadius: 999,
                        padding: "2px 10px",
                        background: "var(--color-surface)",
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </>
  );
}
