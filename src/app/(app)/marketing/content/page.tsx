import { requireSalesUser } from "@/lib/auth/sales-guard";
import { loadContentRows } from "@/lib/reads/marketing";
import { ContentCalendarClient } from "@/components/marketing/ContentCalendarClient";

export const dynamic = "force-dynamic";

// Content calendar — posts, emails, videos, docs, and events in a month view.
export default async function ContentCalendarPage({ searchParams }: { searchParams: Promise<{ content?: string }> }) {
  await requireSalesUser();
  const sp = await searchParams;
  const items = await loadContentRows();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Marketing</div>
          <h1>Content calendar</h1>
          <p className="small">
            Posts, emails, videos, and events in one month view. Dashed chips are still drafts or ideas.
          </p>
        </div>
      </div>
      <ContentCalendarClient items={items} initialOpenId={sp.content ?? null} todayISO={new Date().toISOString()} />
    </>
  );
}
