import { action, optNum, optStr, str } from "@/lib/api";
import {
  normalizeCompRole,
  normalizeVaStatus,
  saveVa,
  type SaveVaInput,
} from "@/lib/actions/hr";

export const POST = action(
  async ({ user, body }) => {
    const input: SaveVaInput = {
      vaId: optionalString(body, "vaId", "va_id"),
      name: str(body, "name").trim(),
      email: str(body, "email").trim(),
      compensationRole: optionalCompRole(body, "compensationRole", "compensation_role"),
      status: optionalVaStatus(body, "status"),
      targetHoursWeekly: optionalNumber(body, "targetHoursWeekly", "target_hours_weekly"),
      supervisorVaId: optionalString(body, "supervisorVaId", "supervisor_va_id"),
      desklogUserId: optionalString(body, "desklogUserId", "desklog_user_id"),
      skillSpecs: optionalString(body, "skillSpecs", "skill_specs"),
      availabilityNotes: optionalString(body, "availabilityNotes", "availability_notes"),
      notionProfileUrl: optionalString(body, "notionProfileUrl", "notion_profile_url"),
    };
    return saveVa(input, user.email);
  },
  { allow: (r) => r === "HR_MANAGER" || r === "PEOPLE_OPS" },
);

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

function optionalVaStatus(body: Record<string, unknown>, ...keys: string[]) {
  const value = optionalString(body, ...keys);
  return value === undefined ? undefined : normalizeVaStatus(value, keys[0]);
}
