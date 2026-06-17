import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { canDecideHire } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { TrainingTaskManager } from "@/components/TrainingTaskManager";

export const dynamic = "force-dynamic";

export default async function SkillsTrialTasksPage() {
  const user = await getCurrentUser();
  if (!(canDecideHire(user.role) || user.isAdmin)) redirect("/recruitment");

  const tasks = await db.trainingAssignment.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Recruitment</div>
          <h1>10-hour training module</h1>
        </div>
        <span className="small">{tasks.filter((t) => t.active).length} active</span>
      </div>
      <p className="small" style={{ marginTop: -8, marginBottom: 20, maxWidth: 660 }}>
        These are the items candidates work through in the timer during their 10-hour training — readings, video tutorials, the quiz, hands-on tasks, and the submission. Candidates must finish every <strong>active</strong> item to be submitted for gate review.
      </p>
      <TrainingTaskManager
        tasks={tasks.map((t) => ({
          id: t.id,
          kind: t.kind,
          task: t.task,
          skill: t.skill,
          estMinutes: t.estMinutes,
          instructions: t.instructions,
          instructionsLink: t.instructionsLink,
          sortOrder: t.sortOrder,
          active: t.active,
        }))}
      />
    </>
  );
}
