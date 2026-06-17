export type CompensationType = "hourly" | "salary";

export type GrossPayInput = {
  compensationType: CompensationType;
  hoursInPeriod: number;
  hourlyRate?: number;
  salaryPerPeriod?: number;
  unpaidGatewayHours?: number;
};

export type VaPayrollInput = {
  vaId: string;
  name: string;
  compensationRole: string;
  status?: string;
};

export type CompensationRoleInput = {
  roleId: string;
  compensationType?: CompensationType;
  hourlyRate?: number;
  salaryPerPeriod?: number;
};

export type PayrollPolicy = {
  unpaidGatewayHours?: number;
  unpaid_gateway_hours?: number;
  traineeUnpaidGatewayHours?: number;
  trainee_unpaid_gateway_hours?: number;
  trainingUnpaidGatewayHours?: number;
  training_unpaid_gateway_hours?: number;
  unpaidGatewayHoursByVaId?: Readonly<Record<string, number | undefined>>;
  unpaid_gateway_hours_by_va_id?: Readonly<Record<string, number | undefined>>;
  priorHoursByVaId?: Readonly<Record<string, number | undefined>>;
  prior_hours_by_va_id?: Readonly<Record<string, number | undefined>>;
  includeStatuses?: readonly string[];
  include_statuses?: readonly string[];
  payrollHoursSource?: string;
  payroll_hours_source?: string;
  tierAdvancementAutomatic?: boolean;
  tier_advancement_automatic?: boolean | string;
  traineeGraduationGate?: string;
  trainee_graduation_gate?: string;
};

export type PayrollCalculationRow = {
  vaId: string;
  name: string;
  compensationRole: string;
  compensationType: CompensationType;
  hoursInPeriod: number;
  hourlyRate?: number;
  salaryPerPeriod?: number;
  grossPay: number;
};

export function computeGrossPay(input: GrossPayInput): number {
  if (input.compensationType === "salary") {
    return finiteOrZero(input.salaryPerPeriod);
  }

  const hoursInPeriod = finiteOrZero(input.hoursInPeriod);
  const unpaidGatewayHours = Math.max(0, finiteOrZero(input.unpaidGatewayHours));
  const payableHours = Math.max(0, hoursInPeriod - unpaidGatewayHours);

  return payableHours * finiteOrZero(input.hourlyRate);
}

export function computePeriodCalculations(
  vas: readonly VaPayrollInput[],
  roles: readonly CompensationRoleInput[],
  hoursByVaId: Readonly<Record<string, number | undefined>>,
  policy: PayrollPolicy = {},
): PayrollCalculationRow[] {
  const rolesById = new Map(roles.map((role) => [role.roleId, role]));
  const includeStatuses = new Set(
    policy.includeStatuses ?? policy.include_statuses ?? ["active", "training"],
  );

  return vas
    .filter((va) => !va.status || includeStatuses.has(va.status))
    .map((va) => {
      const role = rolesById.get(va.compensationRole);
      const compensationType = role?.compensationType ?? "hourly";
      const hoursInPeriod = finiteOrZero(hoursByVaId[va.vaId]);
      const hourlyRate = role?.hourlyRate;
      const salaryPerPeriod = role?.salaryPerPeriod;
      const unpaidGatewayHours =
        compensationType === "hourly" && va.compensationRole === "TRAINEE"
          ? computeRemainingGatewayHours(va.vaId, policy)
          : 0;
      const row: PayrollCalculationRow = {
        vaId: va.vaId,
        name: va.name,
        compensationRole: va.compensationRole,
        compensationType,
        hoursInPeriod,
        grossPay: computeGrossPay({
          compensationType,
          hoursInPeriod,
          hourlyRate,
          salaryPerPeriod,
          unpaidGatewayHours,
        }),
      };

      if (hourlyRate !== undefined) row.hourlyRate = hourlyRate;
      if (salaryPerPeriod !== undefined) row.salaryPerPeriod = salaryPerPeriod;

      return row;
    });
}

function computeRemainingGatewayHours(vaId: string, policy: PayrollPolicy): number {
  const explicitRemaining =
    policy.unpaidGatewayHoursByVaId?.[vaId] ?? policy.unpaid_gateway_hours_by_va_id?.[vaId];
  if (explicitRemaining !== undefined) {
    return Math.max(0, finiteOrZero(explicitRemaining));
  }

  const totalGatewayHours =
    policy.trainingUnpaidGatewayHours ??
    policy.training_unpaid_gateway_hours ??
    policy.traineeUnpaidGatewayHours ??
    policy.trainee_unpaid_gateway_hours ??
    policy.unpaidGatewayHours ??
    policy.unpaid_gateway_hours ??
    0;
  const priorHours = policy.priorHoursByVaId?.[vaId] ?? policy.prior_hours_by_va_id?.[vaId] ?? 0;

  return Math.max(0, finiteOrZero(totalGatewayHours) - finiteOrZero(priorHours));
}

function finiteOrZero(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
