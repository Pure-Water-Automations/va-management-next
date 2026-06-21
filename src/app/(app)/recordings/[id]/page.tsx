import { notFound } from "next/navigation";
import { getCurrentUser, isRecordingsVisible } from "@/lib/auth/access";
import { isGateReviewer } from "@/lib/auth/roles";
import { getRecordingDetail } from "@/lib/reads/recordings";
import { db } from "@/lib/db";
import { RecordingDetailClient } from "@/components/recorder/RecordingDetailClient";

export const dynamic = "force-dynamic";

export default async function RecordingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!isRecordingsVisible(user)) notFound();

  const { id } = await params;
  const detail = await getRecordingDetail(user, id);
  if (!detail) notFound();

  const canReview = user.isAdmin || isGateReviewer(user.role);

  // Active client orgs power the "Share with a client" picker (only the manager needs them).
  const clientOrgs = detail.canManage
    ? await db.clientOrganization.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  return (
    <RecordingDetailClient
      detail={detail}
      streamUrl={`/api/recordings/stream/${id}`}
      canReview={canReview}
      clientOrgs={clientOrgs}
    />
  );
}
