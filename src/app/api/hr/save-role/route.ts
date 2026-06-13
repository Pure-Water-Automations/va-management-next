import { action, optNum, optStr, str } from "@/lib/api";
import {
  normalizeCompensationType,
  normalizeCompRole,
  saveRole,
  type SaveRoleInput,
} from "@/lib/actions/hr";

export const POST = action(
  async ({ user, body }) => {
    const input: SaveRoleInput = {
      roleId: normalizeCompRole(requiredString(body, "roleId", "role_id"), "roleId"),
      roleName: optionalString(body, "roleName", "role_name"),
      compensationType: optionalCompensationType(body, "compensationType", "compensation_type"),
      hourlyRate: optionalNumber(body, "hourlyRate", "hourly_rate"),
      salaryPerPeriod: optionalNumber(body, "salaryPerPeriod", "salary_per_period"),
      onAdvancementTrack: optionalBoolean(body, "onAdvancementTrack", "on_advancement_track"),
      minTotalHoursToReachNext: optionalNumber(
        body,
        "minTotalHoursToReachNext",
        "min_total_hours_to_reach_next",
      ),
      nextRoleId: optionalCompRole(body, "nextRoleId", "next_role_id") ?? null,
      additionalRequirements: optionalString(body, "additionalRequirements", "additional_requirements"),
      notes: optionalString(body, "notes"),
    };
    return saveRole(input, user.email);
  },
  { allow: (r) => r === "HR_MANAGER" || r === "PEOPLE_OPS" },
);

function requiredString(body: Record<string, unknown>, primary: string, fallback: string): string {
  if (optStr(body, primary) !== undefined) return str(body, primary).trim();
  if (optStr(body, fallback) !== undefined) return str(body, fallback).trim();
  return str(body, primary).trim();
}

function optionalString(body: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = optStr(body, key);
    if (value !== undefined) return value.trim();
  }
  return undefined;
}

function optionalNumber(body: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = optNum(body, key);
    if (value !== undefined) return value;
  }
  return undefined;
}

function optionalCompRole(body: Record<string, unknown>, ...keys: string[]) {
  const value = optionalString(body, ...keys);
  return value === undefined ? undefined : normalizeCompRole(value, keys[0]);
}

function optionalCompensationType(body: Record<string, unknown>, ...keys: string[]) {
  const value = optionalString(body, ...keys);
  return value === undefined ? undefined : normalizeCompensationType(value, keys[0]);
}

function optionalBoolean(body: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = body[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "yes", "1", "on"].includes(normalized)) return true;
      if (["false", "no", "0", "off"].includes(normalized)) return false;
    }
    throw new Error(`Invalid boolean field: ${key}`);
  }
  return undefined;
}
