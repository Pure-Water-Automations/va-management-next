type JsonRecord = Record<string, unknown>;

export type DeskLogAttendanceOptions = {
  baseUrl: string;
  bearerToken: string;
  desklogUserId: string | number;
  fromDate: string;
  toDate: string;
};

export type DeskLogAttendanceRow = {
  desklogUserId: string;
  fromDate: string;
  toDate: string;
  date: string | null;
  project: string;
  task: string;
  billable: boolean | null;
  timeAtWorkHrs: number;
  focusTimeHrs: number;
  idleTimeHrs: number;
  taskSpentHrs: number;
  taskAssignedHrs: number;
  activityPct: number | null;
  efficiencyPct: number | null;
  productiveTimeHrs: number;
  nonProductiveTimeHrs: number;
  payRule: "task_spent_time";
  raw: JsonRecord | null;
};

export function parseHoursString(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;

  const str = String(value).trim();
  if (!str || str === "--") return 0;

  const colon = str.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (colon) {
    return Number.parseFloat(colon[1] ?? "0") + Number.parseFloat(colon[2] ?? "0") / 60;
  }

  const hoursMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i);
  const minutesMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)\b/i);
  if (hoursMatch || minutesMatch) {
    const hours = hoursMatch ? Number.parseFloat(hoursMatch[1] ?? "0") : 0;
    const minutes = minutesMatch ? Number.parseFloat(minutesMatch[1] ?? "0") : 0;
    return hours + minutes / 60;
  }

  const parts = str.split(/\s+/);
  const hours = Number.parseFloat(parts[0] ?? "0");
  const minutes = Number.parseFloat(parts[1] ?? "0");
  if (Number.isNaN(hours)) return 0;
  return hours + (Number.isNaN(minutes) ? 0 : minutes / 60);
}

export function pickNumber(obj: unknown, names: readonly string[]): number | null {
  const record = asRecord(obj);
  if (!record) return null;

  const normalizedEntries = new Map<string, unknown>();
  for (const [key, value] of Object.entries(record)) {
    normalizedEntries.set(normalizeKey(key), value);
  }

  for (const name of names) {
    const value = Object.prototype.hasOwnProperty.call(record, name)
      ? record[name]
      : normalizedEntries.get(normalizeKey(name));
    const parsed = parseNumber(value);
    if (parsed !== null) return parsed;
  }

  return null;
}

export type DeskLogUser = { id: string; email: string; name: string };

/**
 * Fetch the DeskLog user directory (id + email + name) so a VA can be linked to
 * its DeskLog account by email without a human copying ids around.
 */
export async function fetchDeskLogUsers(opts: {
  baseUrl: string;
  bearerToken: string;
}): Promise<DeskLogUser[]> {
  const url = new URL(`${opts.baseUrl.replace(/\/+$/, "")}/user_list`);
  url.searchParams.set("status", "active");

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json", Authorization: `Bearer ${opts.bearerToken}` },
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`DeskLog /user_list -> ${response.status}: ${bodyText.slice(0, 200)}`);
  }
  const payload = bodyText ? (JSON.parse(bodyText) as unknown) : {};
  const record = asRecord(payload);
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.data)
      ? (record!.data as unknown[])
      : Array.isArray(record?.users)
        ? (record!.users as unknown[])
        : [];

  const users: DeskLogUser[] = [];
  for (const row of rows) {
    const r = asRecord(row);
    const id = r?.id ?? r?.user_id;
    const email = r?.email;
    if (id != null && typeof email === "string" && email.trim()) {
      users.push({ id: String(id), email: email.trim(), name: pickText(r, ["name"]) });
    }
  }
  return users;
}

export async function fetchAttendance(
  opts: DeskLogAttendanceOptions,
): Promise<DeskLogAttendanceRow> {
  const url = new URL(`${opts.baseUrl.replace(/\/+$/, "")}/attendance_report`);
  url.searchParams.set("user_id", String(opts.desklogUserId));
  url.searchParams.set("from_date", opts.fromDate);
  url.searchParams.set("to_date", opts.toDate);
  url.searchParams.set("duration_format", "hh mm");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.bearerToken}`,
    },
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(
      `DeskLog /attendance_report -> ${response.status}: ${bodyText.slice(0, 200)}`,
    );
  }

  const payload = bodyText ? (JSON.parse(bodyText) as unknown) : {};
  const report = unwrapAttendanceReport(payload);
  return parseAttendanceReport(report, opts);
}

function parseAttendanceReport(
  report: JsonRecord | null,
  opts: DeskLogAttendanceOptions,
): DeskLogAttendanceRow {
  return {
    desklogUserId: String(opts.desklogUserId),
    fromDate: opts.fromDate,
    toDate: opts.toDate,
    date: opts.fromDate === opts.toDate ? opts.fromDate : null,
    project: pickText(report, ["team_name", "project_name", "project"]),
    task: pickText(report, ["task_name", "task"]),
    billable: pickBoolean(report, "billable"),
    timeAtWorkHrs: pickHours(report, [
      "time_at_work",
      "total_worked_time",
      "worked_time",
      "at_work_time",
      "total_time",
      "duration",
    ]),
    focusTimeHrs: pickHours(report, ["focus_time", "total_focus_time"]),
    idleTimeHrs: pickHours(report, ["idle_time", "total_idle_time"]),
    taskSpentHrs: pickHours(report, ["task_spent_time", "task_spent", "spent_time"]),
    taskAssignedHrs: pickHours(report, [
      "task_assigned_time",
      "task_assigned",
      "assigned_time",
    ]),
    activityPct: pickNumber(report, ["activity_percentage", "activity_pct", "activity"]),
    efficiencyPct: pickNumber(report, [
      "efficiency_percentage",
      "efficiency_pct",
      "efficiency",
    ]),
    productiveTimeHrs: pickHours(report, ["productive_time", "total_productive_time"]),
    nonProductiveTimeHrs: pickHours(report, [
      "non_productive_time",
      "total_non_productive_time",
    ]),
    payRule: "task_spent_time",
    raw: report,
  };
}

function unwrapAttendanceReport(payload: unknown): JsonRecord | null {
  const record = asRecord(payload);
  if (!record) return null;

  const data = record.data;
  if (Array.isArray(data)) {
    return data.length > 0 ? asRecord(data[0]) : null;
  }
  if (asRecord(data)) return asRecord(data);
  return record;
}

function pickHours(obj: JsonRecord | null, names: readonly string[]): number {
  if (!obj) return 0;

  for (const name of names) {
    const value = Object.prototype.hasOwnProperty.call(obj, name) ? obj[name] : undefined;
    if (value !== undefined && value !== null && value !== "" && value !== "--") {
      const parsed = parseHoursString(value);
      if (parsed) return parsed;
    }
  }

  return 0;
}

function pickText(obj: JsonRecord | null, names: readonly string[]): string {
  if (!obj) return "";

  for (const name of names) {
    const value = obj[name];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return "";
}

function pickBoolean(obj: JsonRecord | null, name: string): boolean | null {
  if (!obj || !Object.prototype.hasOwnProperty.call(obj, name)) return null;

  const value = obj[name];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1"].includes(normalized)) return true;
    if (["false", "no", "0"].includes(normalized)) return false;
  }

  return null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const normalized = value.replace("%", "").trim();
  if (!normalized || normalized === "--") return null;

  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
