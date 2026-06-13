export type TierEligibilityInput = {
  currentRole: string;
  cumulativeHours: number;
  role: {
    minTotalHoursToReachNext?: number;
    nextRoleId?: string;
    onAdvancementTrack: boolean;
  };
};

export type TierEligibilityResult = {
  eligible: boolean;
  nextRoleId?: string;
};

export function computeEligibility(input: TierEligibilityInput): TierEligibilityResult {
  if (input.currentRole === "TRAINEE") {
    return { eligible: false };
  }

  const threshold = input.role.minTotalHoursToReachNext;
  const nextRoleId = input.role.nextRoleId;

  if (
    !input.role.onAdvancementTrack ||
    !nextRoleId ||
    typeof threshold !== "number" ||
    !Number.isFinite(threshold) ||
    input.cumulativeHours < threshold
  ) {
    return { eligible: false };
  }

  return { eligible: true, nextRoleId };
}
