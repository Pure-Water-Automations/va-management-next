import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { isGateReviewer } from "@/lib/auth/roles";
import { getRecordingDetail } from "@/lib/reads/recordings";
import { RecordingDetailClient } from "@/components/recorder/RecordingDetailClient";

export const dynamic = "force-dynamic";

export default async function RecordingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user.isAdmin) notFound();

  const { id } = await params;
  const detail = await getRecordingDetail(user, id);
  if (!detail) notFound();

  const canReview = user.isAdmin || isGateReviewer(user.role);

  return (
    <RecordingDetailClient detail={detail} streamUrl={`/api/recordings/stream/${id}`} canReview={canReview} />
  );
}
