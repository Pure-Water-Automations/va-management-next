export type CapacityFlags = {
  overburdened: boolean;
  underutilized: boolean;
};

export type CapacitySeverity = "red" | "yellow" | "green";

export type CapacityTransition = {
  transition: "flagged" | "cleared" | "none";
  severity: CapacitySeverity;
};

export function computeUtilization(
  targetHoursWeekly: number,
  last14dHours: number,
): { expected14d: number; utilizationPct: number } {
  const expected14d = Math.max(0, finiteOrZero(targetHoursWeekly) * 2);
  const utilizationPct =
    expected14d > 0 ? (finiteOrZero(last14dHours) / expected14d) * 100 : 0;

  return { expected14d, utilizationPct };
}

export function computeFlags(
  targetHoursWeekly: number,
  last14dHours: number,
): CapacityFlags;
export function computeFlags(input: {
  utilizationPct: number;
  last14dHours: number;
}): CapacityFlags;
export function computeFlags(
  inputOrTargetHoursWeekly: number | { utilizationPct: number; last14dHours: number },
  maybeLast14dHours?: number,
): CapacityFlags {
  const last14dHours =
    typeof inputOrTargetHoursWeekly === "number"
      ? finiteOrZero(maybeLast14dHours)
      : finiteOrZero(inputOrTargetHoursWeekly.last14dHours);
  const utilizationPct =
    typeof inputOrTargetHoursWeekly === "number"
      ? computeUtilization(inputOrTargetHoursWeekly, last14dHours).utilizationPct
      : finiteOrZero(inputOrTargetHoursWeekly.utilizationPct);

  return {
    overburdened: utilizationPct > 120 || last14dHours > 60,
    underutilized: utilizationPct < 50,
  };
}

export function detectTransition(
  prevSeverity: CapacitySeverity | null | undefined,
  currentFlags: CapacityFlags,
): CapacityTransition {
  const severity = severityForFlags(currentFlags);

  if (severity === prevSeverity) {
    return { transition: "none", severity };
  }

  if (severity === "green" && prevSeverity && prevSeverity !== "green") {
    return { transition: "cleared", severity };
  }

  if (severity !== "green") {
    return { transition: "flagged", severity };
  }

  return { transition: "none", severity };
}

function severityForFlags(flags: CapacityFlags): CapacitySeverity {
  if (flags.overburdened) return "red";
  if (flags.underutilized) return "yellow";
  return "green";
}

function finiteOrZero(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
