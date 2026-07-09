// Flag-for-review anomaly detection (proposal §6.4). Pure — callers assemble
// the inputs from the hours source + prior PayrollCalculation rows. Flagged
// rows are excluded from bulk-approve and show reasons inline.

export type AnomalyInput = {
  hoursInPeriod: number;
  /** Hours from up to the 3 most recent CLOSED periods (may be empty for new VAs). */
  trailingPeriodHours: number[];
  targetHoursWeekly: number | null;
  weeksInPeriod: number;
  needsReviewDays: number;
  newProjects: string[]; // projects logged this period never seen for this VA before
  wasActiveLastPeriod: boolean;
  spikeMultiplier?: number; // Setting `payroll_spike_multiplier`, default 1.5
};

export function detectAnomalies(i: AnomalyInput): string[] {
  const reasons: string[] = [];
  const mult = i.spikeMultiplier ?? 1.5;

  if (i.trailingPeriodHours.length > 0) {
    const avg = i.trailingPeriodHours.reduce((s, h) => s + h, 0) / i.trailingPeriodHours.length;
    if (avg > 0 && i.hoursInPeriod > avg * mult) {
      reasons.push(`Hours ${i.hoursInPeriod.toFixed(1)} exceed ${mult}× the trailing average (${avg.toFixed(1)})`);
    }
  }
  if (i.targetHoursWeekly != null && i.targetHoursWeekly > 0 && i.hoursInPeriod > i.targetHoursWeekly * i.weeksInPeriod) {
    reasons.push(`Hours exceed target (${i.targetHoursWeekly}/wk × ${i.weeksInPeriod.toFixed(1)} wks)`);
  }
  if (i.hoursInPeriod === 0 && i.wasActiveLastPeriod) {
    reasons.push("Zero hours this period for a previously active VA");
  }
  if (i.needsReviewDays > 0) {
    reasons.push(`${i.needsReviewDays} tracker day(s) marked needs-review`);
  }
  if (i.newProjects.length > 0) {
    reasons.push(`New project(s) this period: ${i.newProjects.join(", ")}`);
  }
  return reasons;
}
