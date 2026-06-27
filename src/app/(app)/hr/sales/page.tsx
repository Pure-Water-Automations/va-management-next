import { redirect } from "next/navigation";

// The sales pipeline now lives at its own top-level /sales console (Phase 4).
// Kept here so existing links/bookmarks keep working.
export default function HrSalesRedirect() {
  redirect("/sales");
}
