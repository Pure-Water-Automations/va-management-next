import { requireSalesUser } from "@/lib/auth/sales-guard";
import { loadSocialRows } from "@/lib/reads/marketing";
import { SocialQueueClient } from "@/components/marketing/SocialQueueClient";

export const dynamic = "force-dynamic";

// Social queue — approve what's ready; posted items show what they earned.
export default async function SocialQueuePage() {
  await requireSalesUser();
  const posts = await loadSocialRows();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Marketing</div>
          <h1>Social queue</h1>
          <p className="small">
            Every post waiting to go out. Approve what is ready — posted items show what they earned.
          </p>
        </div>
      </div>
      <SocialQueueClient posts={posts} />
    </>
  );
}
