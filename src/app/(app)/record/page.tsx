import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { Recorder } from "@/components/recorder/Recorder";
import { Card } from "@/components/ui/Card";
import { r2Configured } from "@/lib/r2";

export const dynamic = "force-dynamic";

// Admin-only while the feature is in preview (see docs/recordings-feature.md).
export default async function RecordPage() {
  const user = await getCurrentUser();
  if (!user.isAdmin) notFound();

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Recordings</div>
          <h1>Record</h1>
        </div>
      </div>
      {!r2Configured() && (
        <Card variant="outline" style={{ marginBottom: 16 }}>
          <p className="small">
            Video storage isn&apos;t configured yet — set the <code>R2_*</code> environment variables to enable
            saving. The recorder UI below still works for testing capture.
          </p>
        </Card>
      )}
      <Recorder />
    </>
  );
}
