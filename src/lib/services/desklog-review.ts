export type DesklogReviewRow = {
  taskSpentHrs: number;
  timeAtWorkHrs: number;
  focusTimeHrs: number;
  idleTimeHrs: number;
  taskAssignedHrs?: number;
};

export type DesklogReviewFlag = {
  needsReview: boolean;
  reason?: string;
};

export function computeReviewFlag(row: DesklogReviewRow): DesklogReviewFlag {
  const taskSpentHrs = finiteOrZero(row.taskSpentHrs);
  const timeAtWorkHrs = finiteOrZero(row.timeAtWorkHrs);
  const focusTimeHrs = finiteOrZero(row.focusTimeHrs);
  const idleTimeHrs = finiteOrZero(row.idleTimeHrs);
  const taskAssignedHrs = finiteOrZero(row.taskAssignedHrs);

  if (taskSpentHrs >= 10) {
    return { needsReview: true, reason: "task_spent_10h_or_more" };
  }

  if (timeAtWorkHrs >= 16) {
    return { needsReview: true, reason: "time_at_work_16h_or_more" };
  }

  if (focusTimeHrs >= 4 && taskSpentHrs === 0) {
    return { needsReview: true, reason: "focus_time_without_task_spent" };
  }

  if (taskAssignedHrs > 0 && taskSpentHrs > taskAssignedHrs) {
    return { needsReview: true, reason: "task_spent_exceeds_assigned" };
  }

  if (timeAtWorkHrs >= 4 && idleTimeHrs / timeAtWorkHrs >= 0.5) {
    return { needsReview: true, reason: "idle_time_at_least_50pct" };
  }

  return { needsReview: false };
}

function finiteOrZero(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
