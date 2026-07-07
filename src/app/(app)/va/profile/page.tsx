import { getCurrentUser, getEffectiveVaId } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { ProfileForm } from "@/components/ProfileForm";

export const dynamic = "force-dynamic";

export default async function VaProfilePage() {
  const user = await getCurrentUser();
  const vaId = await getEffectiveVaId(user);
  if (!vaId) {
    return (
      <div className="page-head"><div><h1>My profile</h1><p className="small">Your login isn’t linked to a VA record.</p></div></div>
    );
  }
  const va = await db.va.findUnique({ where: { vaId } });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">My Console</div>
          <h1>My profile</h1>
        </div>
      </div>
      <Card>
        <p className="small" style={{ marginTop: 0, marginBottom: 18 }}>
          What your teammates see in the Team directory — add a photo so people can put a face to your name.
        </p>
        <ProfileForm
          defaults={{
            name: va?.name ?? user.name ?? user.email,
            photoSrc: va?.photoKey ? `/api/people/photo/${vaId}?v=${va.updatedAt.getTime()}` : null,
            bio: va?.bio,
            location: va?.location,
            timezone: va?.timezone,
            birthdayMonth: va?.birthdayMonth,
            birthdayDay: va?.birthdayDay,
          }}
        />
        {va?.skillSpecs ? (
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--color-border)" }}>
            <div className="small" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-text-tertiary)", marginBottom: 6 }}>
              Skills on record
            </div>
            <div className="small">{va.skillSpecs}</div>
            <div className="small" style={{ color: "var(--color-text-tertiary)", marginTop: 4 }}>
              Managed by HR — ask if something's out of date.
            </div>
          </div>
        ) : null}
      </Card>
    </>
  );
}
