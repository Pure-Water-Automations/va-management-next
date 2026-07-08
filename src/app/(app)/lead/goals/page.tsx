import { redirect } from "next/navigation";
import { requireSalesUser } from "@/lib/auth/sales-guard";
import { loadGoals } from "@/lib/reads/lead";
import { quarterLabel } from "@/lib/sales/pace";
import { GoalsClient } from "@/components/lead/GoalsClient";

export const dynamic = "force-dynamic";

// Team Lead — Goals (quarterly, with key-result checklists). The header lives
// in the client component because the "+ New goal" toggle is stateful.
export default async function LeadGoalsPage() {
  const user = await requireSalesUser();
  if (!user.isAdmin) redirect("/sales");

  const goals = await loadGoals();
  return <GoalsClient goals={goals} quarter={quarterLabel()} />;
}
