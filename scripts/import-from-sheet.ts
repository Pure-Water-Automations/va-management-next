import { createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const hasSourceSheetId = Boolean(process.env.SOURCE_SHEET_ID?.trim());
const hasGoogleCredentials = Boolean(
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ||
    process.env.GOOGLE_SERVICE_ACCOUNT_FILE?.trim(),
);

if (!hasSourceSheetId || !hasGoogleCredentials) {
  console.log("set SOURCE_SHEET_ID + GOOGLE_SERVICE_ACCOUNT_* to run");
  process.exit(0);
}

type Db = typeof import("../src/lib/db").db;
type ReadTab = typeof import("../src/lib/google/sheets").readTab;

type SheetRow = Record<string, unknown>;
type SummaryValue = number | "missing";
type Importer = (row: SheetRow) => Promise<boolean>;

let db: Db | undefined;

const TAB_ORDER = [
  "VA_Registry",
  "Compensation_Roles",
  "DeskLog_Hours_Raw",
  "DeskLog_Efficiency_Daily",
  "Payroll_Periods",
  "Payroll_Calculations",
  "Tier_Eligibility_Log",
  "Capacity_Flag_Events",
  "Recruitment_Pipeline",
  "Training_Time_Sessions",
  "Onboarding_Tracker",
  "System_Config",
  "Policy_Config",
  "Notion_Refs",
  "Activity_Log",
] as const;

const HEADER_HINTS: Record<string, string[]> = {
  VA_Registry: ["va_id"],
  Compensation_Roles: ["role_id"],
  DeskLog_Hours_Raw: ["date"],
  DeskLog_Efficiency_Daily: ["date"],
  Payroll_Periods: ["period_start"],
  Payroll_Calculations: ["period_start"],
  Tier_Eligibility_Log: ["timestamp"],
  Capacity_Flag_Events: ["timestamp"],
  Recruitment_Pipeline: ["candidate_id", "email"],
  Training_Time_Sessions: ["session_id", "candidate_id"],
  Onboarding_Tracker: ["va_id", "onboarding_id"],
  System_Config: ["key"],
  Policy_Config: ["key"],
  Notion_Refs: ["ref_id"],
  Activity_Log: ["timestamp"],
};

const COMP_ROLES = ["TRAINEE", "TIER_1", "TIER_2", "TIER_3", "TIER_4"] as const;
const COMPENSATION_TYPES = ["hourly", "salary"] as const;
const VA_STATUSES = ["active", "training", "departed"] as const;
const PERIOD_STATUSES = ["open", "closed", "paid"] as const;
const TIER_REVIEW_STATUSES = [
  "hours_triggered",
  "form_sent",
  "under_review",
  "approved",
  "declined",
] as const;
const CANDIDATE_STAGES = [
  "applied",
  "reviewed",
  "interview_scheduled",
  "interviewed",
  "decision",
  "tenhr_invited",
  "tenhr_in_progress",
  "tenhr_pass",
  "tenhr_fail",
  "contract_sent",
  "signed",
  "onboarding",
  "closed",
] as const;
const RECRUITER_RECOMMENDATIONS = [
  "recommend_hire",
  "consider",
  "pass",
  "on_waitlist",
] as const;
const FINAL_DECISIONS = ["invite_tenhr", "waitlist", "reject"] as const;
const GATE_RESULTS = ["pass", "fail", "pending"] as const;
const CONTRACT_STATUSES = ["awaiting_send", "viewed", "sent", "signed", "completed"] as const;
const SESSION_STATUSES = ["active", "completed", "rejected", "void"] as const;
const REVIEW_STATUSES = ["needs_review", "approved", "question", "rejected", "void"] as const;
const ONBOARDING_STATUSES = ["pending", "in_progress", "completed"] as const;

type CompRoleValue = (typeof COMP_ROLES)[number];
type VaStatusValue = (typeof VA_STATUSES)[number];

const summary = new Map<string, SummaryValue>();
const vaExistsCache = new Map<string, boolean>();
const candidateCache = new Map<string, string>();
const pendingSupervisorUpdates: { vaId: string; supervisorVaId: string | null }[] = [];

function database(): Db {
  if (!db) throw new Error("Database client was not initialized");
  return db;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return toDate(Number(text));
  const dmy = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) {
    return new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateOnly(value: unknown): Date | null {
  const date = toDate(value);
  if (!date) return null;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function firstLine(error: unknown): string {
  return String(error instanceof Error ? error.message : error).split("\n")[0] ?? "";
}

function findValue(row: SheetRow, names: string[]): { found: boolean; value: unknown } {
  for (const name of names) {
    const key = normalizeHeader(name);
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return { found: true, value: row[key] };
    }
  }
  return { found: false, value: undefined };
}

function getText(row: SheetRow, ...names: string[]): string | undefined {
  const found = findValue(row, names);
  if (!found.found || isBlank(found.value)) return undefined;
  return String(found.value).trim();
}

function getNullableText(row: SheetRow, ...names: string[]): string | null | undefined {
  const found = findValue(row, names);
  if (!found.found) return undefined;
  if (isBlank(found.value)) return null;
  return String(found.value).trim();
}

function getNumber(row: SheetRow, ...names: string[]): number | undefined {
  const found = findValue(row, names);
  if (!found.found || isBlank(found.value)) return undefined;
  const parsed =
    typeof found.value === "number"
      ? found.value
      : Number(String(found.value).replace(/[$,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getNullableNumber(row: SheetRow, ...names: string[]): number | null | undefined {
  const found = findValue(row, names);
  if (!found.found) return undefined;
  if (isBlank(found.value)) return null;
  return getNumber(row, ...names);
}

function getInteger(row: SheetRow, ...names: string[]): number | undefined {
  const value = getNumber(row, ...names);
  return value === undefined ? undefined : Math.round(value);
}

function getNullableInteger(row: SheetRow, ...names: string[]): number | null | undefined {
  const found = findValue(row, names);
  if (!found.found) return undefined;
  if (isBlank(found.value)) return null;
  const value = getNumber(row, ...names);
  return value === undefined ? undefined : Math.round(value);
}

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "y", "1", "on"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "off"].includes(normalized)) return false;
  return undefined;
}

function getBoolean(row: SheetRow, ...names: string[]): boolean | undefined {
  const found = findValue(row, names);
  if (!found.found || isBlank(found.value)) return undefined;
  return parseBoolean(found.value);
}

function getNullableBoolean(row: SheetRow, ...names: string[]): boolean | null | undefined {
  const found = findValue(row, names);
  if (!found.found) return undefined;
  if (isBlank(found.value)) return null;
  return parseBoolean(found.value);
}

function getDate(row: SheetRow, ...names: string[]): Date | undefined {
  const found = findValue(row, names);
  if (!found.found || isBlank(found.value)) return undefined;
  return toDate(found.value) ?? undefined;
}

function getNullableDate(row: SheetRow, ...names: string[]): Date | null | undefined {
  const found = findValue(row, names);
  if (!found.found) return undefined;
  if (isBlank(found.value)) return null;
  return toDate(found.value) ?? undefined;
}

function getDateOnly(row: SheetRow, ...names: string[]): Date | undefined {
  const found = findValue(row, names);
  if (!found.found || isBlank(found.value)) return undefined;
  return toDateOnly(found.value) ?? undefined;
}

function getNullableDateOnly(row: SheetRow, ...names: string[]): Date | null | undefined {
  const found = findValue(row, names);
  if (!found.found) return undefined;
  if (isBlank(found.value)) return null;
  return toDateOnly(found.value) ?? undefined;
}

function compact<T extends object>(value: T): T {
  const copy = { ...value };
  const copyAsRecord = copy as Record<string, unknown>;
  for (const key of Object.keys(copyAsRecord)) {
    if (copyAsRecord[key] === undefined) {
      delete copyAsRecord[key];
    }
  }
  return copy;
}

function parseEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  normalize: (text: string) => string = (text) => normalizeHeader(text),
): T[number] | undefined {
  if (isBlank(value)) return undefined;
  const normalized = normalize(String(value));
  return allowed.includes(normalized as T[number]) ? (normalized as T[number]) : undefined;
}

function getEnum<const T extends readonly string[]>(
  row: SheetRow,
  allowed: T,
  normalize: (text: string) => string,
  ...names: string[]
): T[number] | undefined {
  const found = findValue(row, names);
  if (!found.found || isBlank(found.value)) return undefined;
  return parseEnum(found.value, allowed, normalize);
}

function getNullableEnum<const T extends readonly string[]>(
  row: SheetRow,
  allowed: T,
  normalize: (text: string) => string,
  ...names: string[]
): T[number] | null | undefined {
  const found = findValue(row, names);
  if (!found.found) return undefined;
  if (isBlank(found.value)) return null;
  return parseEnum(found.value, allowed, normalize);
}

function normalizeUpperSnake(text: string): string {
  return normalizeHeader(text).toUpperCase();
}

function normalizeLowerSnake(text: string): string {
  return normalizeHeader(text);
}

function normalizeCompRoleValue(value: unknown): CompRoleValue | undefined {
  if (isBlank(value)) return undefined;
  let normalized = normalizeUpperSnake(String(value));
  if (normalized === "TRAINING") normalized = "TRAINEE";
  normalized = normalized.replace(/^TIER([1-4])$/, "TIER_$1");
  return COMP_ROLES.includes(normalized as CompRoleValue)
    ? (normalized as CompRoleValue)
    : undefined;
}

function getCompRole(row: SheetRow, ...names: string[]): CompRoleValue | undefined {
  const found = findValue(row, names);
  if (!found.found || isBlank(found.value)) return undefined;
  return normalizeCompRoleValue(found.value);
}

function getNullableCompRole(row: SheetRow, ...names: string[]): CompRoleValue | null | undefined {
  const found = findValue(row, names);
  if (!found.found) return undefined;
  if (isBlank(found.value)) return null;
  return normalizeCompRoleValue(found.value);
}

function normalizeVaStatus(value: unknown): VaStatusValue | undefined {
  if (isBlank(value)) return undefined;
  const normalized = normalizeLowerSnake(String(value));
  if (normalized === "trainee" || normalized === "onboarding") return "training";
  if (normalized === "inactive" || normalized === "left" || normalized === "terminated") {
    return "departed";
  }
  return VA_STATUSES.includes(normalized as VaStatusValue)
    ? (normalized as VaStatusValue)
    : undefined;
}

function normalizeEmail(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase() || undefined;
}

function normalizeTabRange(tabTitle: string): string {
  return `'${tabTitle.replace(/'/g, "''")}'!A:ZZ`;
}

function findTabTitle(availableTabs: string[], expected: string): string | undefined {
  return (
    availableTabs.find((tab) => tab === expected) ??
    availableTabs.find((tab) => tab.trim().toLowerCase() === expected.toLowerCase())
  );
}

function rowsFromValues(tabName: string, values: unknown[][]): SheetRow[] {
  if (values.length === 0) return [];
  const hints = HEADER_HINTS[tabName] ?? [];
  let headerIndex = 0;

  for (let index = 0; index < Math.min(values.length, 10); index++) {
    const row = values[index] ?? [];
    const headers = row.map(normalizeHeader);
    const nonEmpty = headers.filter(Boolean).length;
    if (hints.some((hint) => headers.includes(hint)) && nonEmpty > 1) {
      headerIndex = index;
      break;
    }
  }

  const headers = (values[headerIndex] ?? []).map(normalizeHeader);
  return values
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => !isBlank(cell)))
    .map((row) => {
      const result: SheetRow = {};
      headers.forEach((header, index) => {
        if (header) result[header] = row[index];
      });
      return result;
    });
}

async function readRowsForTab(
  spreadsheetId: string,
  availableTabs: string[],
  readTab: ReadTab,
  tabName: string,
): Promise<SheetRow[] | null> {
  const actualTitle = findTabTitle(availableTabs, tabName);
  if (!actualTitle) {
    summary.set(tabName, "missing");
    return null;
  }
  const values = await readTab(spreadsheetId, normalizeTabRange(actualTitle));
  return rowsFromValues(tabName, values);
}

async function importRows(tabName: string, rows: SheetRow[], importer: Importer): Promise<void> {
  let imported = 0;
  let skipped = 0;
  for (const [index, row] of rows.entries()) {
    try {
      if (await importer(row)) imported += 1;
    } catch (error) {
      skipped += 1;
      console.warn(`Skipped ${tabName} row ${index + 1}: ${firstLine(error)}`);
    }
  }
  summary.set(tabName, imported);
  if (skipped > 0) console.warn(`${tabName}: skipped ${skipped} row(s).`);
}

async function importTab(
  spreadsheetId: string,
  availableTabs: string[],
  readTab: ReadTab,
  tabName: string,
  importer: Importer,
): Promise<void> {
  const rows = await readRowsForTab(spreadsheetId, availableTabs, readTab, tabName);
  if (!rows) return;
  await importRows(tabName, rows, importer);
}

async function vaExists(vaId: string): Promise<boolean> {
  const cached = vaExistsCache.get(vaId);
  if (cached !== undefined) return cached;
  const found = await database().va.findUnique({ where: { vaId }, select: { vaId: true } });
  const exists = Boolean(found);
  vaExistsCache.set(vaId, exists);
  return exists;
}

async function candidateIdFor(row: SheetRow): Promise<string | undefined> {
  const explicitCandidateId = getText(row, "candidate_id");
  if (explicitCandidateId && candidateCache.has(explicitCandidateId)) {
    return candidateCache.get(explicitCandidateId);
  }

  if (explicitCandidateId) {
    const candidate = await database().candidate.findUnique({
      where: { candidateId: explicitCandidateId },
      select: { candidateId: true },
    });
    if (candidate) {
      candidateCache.set(explicitCandidateId, candidate.candidateId);
      return candidate.candidateId;
    }
  }

  const email = normalizeEmail(getText(row, "candidate_email", "email"));
  if (email && candidateCache.has(email)) return candidateCache.get(email);
  if (email) {
    const candidate = await database().candidate.findUnique({
      where: { email },
      select: { candidateId: true },
    });
    if (candidate) {
      candidateCache.set(email, candidate.candidateId);
      if (explicitCandidateId) candidateCache.set(explicitCandidateId, candidate.candidateId);
      return candidate.candidateId;
    }
  }

  if (!email) return undefined;

  const created = await database().candidate.create({
    data: compact({
      candidateId: explicitCandidateId,
      email,
      name: getNullableText(row, "candidate_name", "name"),
    }),
    select: { candidateId: true },
  });
  candidateCache.set(email, created.candidateId);
  if (explicitCandidateId) candidateCache.set(explicitCandidateId, created.candidateId);
  return created.candidateId;
}

function stableId(prefix: string, parts: unknown[]): string {
  const hash = createHash("sha1")
    .update(parts.map((part) => String(part ?? "")).join("|"))
    .digest("hex")
    .slice(0, 24);
  return `${prefix}_${hash}`;
}

function isSecretKey(key: string): boolean {
  return /token|bearer|secret|password|private_key/i.test(key);
}

async function importCompensationRole(row: SheetRow): Promise<boolean> {
  const roleId = normalizeCompRoleValue(getText(row, "role_id"));
  if (!roleId) return false;
  const roleName = getText(row, "role_name") ?? roleId;
  const compensationType =
    getEnum(row, COMPENSATION_TYPES, normalizeLowerSnake, "compensation_type") ?? "hourly";
  const onAdvancementTrack = getBoolean(row, "on_advancement_track");
  const nextRoleId = getNullableCompRole(row, "next_role_id");
  const data = compact({
    roleName,
    compensationType,
    hourlyRate: getNullableNumber(row, "hourly_rate"),
    salaryPerPeriod: getNullableNumber(row, "salary_per_period"),
    onAdvancementTrack,
    minTotalHoursToReachNext: getNullableNumber(row, "min_total_hours_to_reach_next"),
    nextRoleId,
    additionalRequirements: getNullableText(row, "additional_requirements"),
    notes: getNullableText(row, "notes"),
  });

  await database().compensationRole.upsert({
    where: { roleId },
    update: data,
    create: {
      roleId,
      roleName,
      compensationType,
      onAdvancementTrack: onAdvancementTrack ?? true,
      hourlyRate: data.hourlyRate,
      salaryPerPeriod: data.salaryPerPeriod,
      minTotalHoursToReachNext: data.minTotalHoursToReachNext,
      nextRoleId: data.nextRoleId,
      additionalRequirements: data.additionalRequirements,
      notes: data.notes,
    },
  });
  return true;
}

async function importVa(row: SheetRow): Promise<boolean> {
  const vaId = getText(row, "va_id");
  const name = getText(row, "name");
  const email = normalizeEmail(getText(row, "email"));
  if (!vaId || !name || !email) return false;

  const compensationRole = getCompRole(row, "compensation_role");
  const status = normalizeVaStatus(getText(row, "status"));
  const supervisorVaId = getNullableText(row, "supervisor_va_id");
  if (supervisorVaId !== undefined) pendingSupervisorUpdates.push({ vaId, supervisorVaId });

  const data = compact({
    name,
    email,
    compensationRole,
    status,
    targetHoursWeekly: getNullableNumber(row, "target_hours_weekly"),
    desklogUserId: getNullableText(row, "desklog_user_id"),
    skillSpecs: getNullableText(row, "skill_specs"),
    availabilityNotes: getNullableText(row, "availability_notes"),
    lastCheckinDate: getNullableDate(row, "last_checkin_date"),
    notionProfileUrl: getNullableText(row, "notion_profile_url"),
    roleStartedDate: getNullableDate(row, "role_started_date"),
    notionDisplayTier: getNullableText(row, "notion_display_tier"),
    tierMismatchFlag: getNullableText(row, "tier_mismatch_flag"),
  });

  await database().va.upsert({
    where: { vaId },
    update: data,
    create: {
      vaId,
      name,
      email,
      compensationRole: compensationRole ?? "TRAINEE",
      status: status ?? "training",
      targetHoursWeekly: data.targetHoursWeekly,
      desklogUserId: data.desklogUserId,
      skillSpecs: data.skillSpecs,
      availabilityNotes: data.availabilityNotes,
      lastCheckinDate: data.lastCheckinDate,
      notionProfileUrl: data.notionProfileUrl,
      roleStartedDate: data.roleStartedDate,
      notionDisplayTier: data.notionDisplayTier,
      tierMismatchFlag: data.tierMismatchFlag,
    },
  });
  vaExistsCache.set(vaId, true);
  return true;
}

async function applySupervisorUpdates(): Promise<void> {
  for (const update of pendingSupervisorUpdates) {
    if (!update.supervisorVaId) {
      await database().va.update({ where: { vaId: update.vaId }, data: { supervisorVaId: null } });
      continue;
    }
    if (update.supervisorVaId === update.vaId) continue;
    if (!(await vaExists(update.supervisorVaId))) {
      console.warn(
        `Skipped supervisor for ${update.vaId}: VA ${update.supervisorVaId} was not imported`,
      );
      continue;
    }
    await database().va.update({
      where: { vaId: update.vaId },
      data: { supervisorVaId: update.supervisorVaId },
    });
  }
}

async function importDeskLogHours(row: SheetRow): Promise<boolean> {
  const date = getDateOnly(row, "date");
  const vaId = getText(row, "va_id");
  if (!date || !vaId || !(await vaExists(vaId))) return false;
  const taskSpentHrs = getNumber(row, "task_spent_hrs", "hours") ?? 0;
  const needsReview = getBoolean(row, "needs_review");
  const data = compact({
    desklogUserId: getNullableText(row, "desklog_user_id"),
    project: getNullableText(row, "project"),
    task: getNullableText(row, "task"),
    billable: getNullableBoolean(row, "billable"),
    timeAtWorkHrs: getNullableNumber(row, "time_at_work_hrs"),
    focusTimeHrs: getNullableNumber(row, "focus_time_hrs"),
    idleTimeHrs: getNullableNumber(row, "idle_time_hrs"),
    taskSpentHrs,
    taskAssignedHrs: getNullableNumber(row, "task_assigned_hrs"),
    payRule: getNullableText(row, "pay_rule"),
    needsReview,
    reviewReason: getNullableText(row, "review_reason"),
  });

  // DeskLog_Hours_Raw is an append log: multiple rows per (va, date) — one per
  // project/task. NOT unique on (date, vaId); the table is cleared before import
  // (see main) so plain create is idempotent across runs.
  await database().deskLogHours.create({
    data: { ...data, date, vaId, taskSpentHrs, needsReview: needsReview ?? false },
  });
  return true;
}

async function importDeskLogEfficiency(row: SheetRow): Promise<boolean> {
  const date = getDateOnly(row, "date");
  const vaId = getText(row, "va_id");
  if (!date || !vaId || !(await vaExists(vaId))) return false;
  const data = compact({
    desklogUserId: getNullableText(row, "desklog_user_id"),
    activityPct: getNullableNumber(row, "activity_pct"),
    efficiencyPct: getNullableNumber(row, "efficiency_pct"),
    productiveTimeHrs: getNullableNumber(row, "productive_time_hrs"),
    focusTimeHrs: getNullableNumber(row, "focus_time_hrs"),
    idleTimeHrs: getNullableNumber(row, "idle_time_hrs"),
    nonProductiveTimeHrs: getNullableNumber(row, "non_productive_time_hrs"),
  });

  // Append log like DeskLog_Hours_Raw: multiple rows per (va, date). Table is
  // cleared before import (see main) so plain create is idempotent.
  await database().deskLogEfficiency.create({
    data: { ...data, date, vaId },
  });
  return true;
}

async function importPayrollPeriod(row: SheetRow): Promise<boolean> {
  const periodStart = getDateOnly(row, "period_start");
  const periodEnd = getDateOnly(row, "period_end");
  const closeDate = getDateOnly(row, "close_date");
  if (!periodStart || !periodEnd || !closeDate) return false;
  const status = getEnum(row, PERIOD_STATUSES, normalizeLowerSnake, "status");
  const data = compact({
    periodEnd,
    closeDate,
    status,
    periodTotalHours: getNullableNumber(row, "period_total_hours"),
    periodTotalPayroll: getNullableNumber(row, "period_total_payroll"),
    reminder3dSentAt: getNullableDate(row, "reminder_3d_sent_at"),
    reminder1dSentAt: getNullableDate(row, "reminder_1d_sent_at"),
    bookkeeperEmailSentAt: getNullableDate(row, "bookkeeper_email_sent_at"),
  });

  await database().payrollPeriod.upsert({
    where: { periodStart },
    update: data,
    create: {
      periodStart,
      periodEnd,
      closeDate,
      status: status ?? "open",
      periodTotalHours: data.periodTotalHours,
      periodTotalPayroll: data.periodTotalPayroll,
      reminder3dSentAt: data.reminder3dSentAt,
      reminder1dSentAt: data.reminder1dSentAt,
      bookkeeperEmailSentAt: data.bookkeeperEmailSentAt,
    },
  });
  return true;
}

async function importPayrollCalculation(row: SheetRow): Promise<boolean> {
  const periodStart = getDateOnly(row, "period_start");
  const periodEnd = getDateOnly(row, "period_end");
  const vaId = getText(row, "va_id");
  if (!periodStart || !periodEnd || !vaId || !(await vaExists(vaId))) return false;

  await database().payrollPeriod.upsert({
    where: { periodStart },
    update: { periodEnd },
    create: { periodStart, periodEnd, closeDate: periodEnd, status: "closed" },
  });

  const va = await database().va.findUnique({
    where: { vaId },
    select: { name: true, compensationRole: true },
  });
  const compensationRole = getCompRole(row, "compensation_role") ?? va?.compensationRole ?? "TRAINEE";
  const compensationType =
    getEnum(row, COMPENSATION_TYPES, normalizeLowerSnake, "compensation_type") ?? "hourly";
  const hoursInPeriod = getNumber(row, "hours_in_period") ?? 0;
  const grossPay = getNumber(row, "gross_pay") ?? 0;
  const data = compact({
    periodEnd,
    name: getText(row, "name") ?? va?.name ?? vaId,
    compensationRole,
    compensationType,
    hoursInPeriod,
    hourlyRate: getNullableNumber(row, "hourly_rate"),
    salaryPerPeriod: getNullableNumber(row, "salary_per_period"),
    grossPay,
  });

  await database().payrollCalculation.upsert({
    where: { periodStart_vaId: { periodStart, vaId } },
    update: data,
    create: {
      periodStart,
      periodEnd,
      vaId,
      name: data.name,
      compensationRole,
      compensationType,
      hoursInPeriod,
      hourlyRate: data.hourlyRate,
      salaryPerPeriod: data.salaryPerPeriod,
      grossPay,
    },
  });
  return true;
}

async function importTierReview(row: SheetRow): Promise<boolean> {
  const timestamp = getDate(row, "timestamp");
  const vaId = getText(row, "va_id");
  if (!timestamp || !vaId || !(await vaExists(vaId))) return false;
  const status =
    getEnum(row, TIER_REVIEW_STATUSES, normalizeLowerSnake, "status") ?? "hours_triggered";
  const data = compact({
    timestamp,
    vaId,
    vaName: getNullableText(row, "va_name"),
    currentRole: getNullableCompRole(row, "current_role"),
    targetRole: getNullableCompRole(row, "target_role"),
    cumulativeHoursAtTrigger: getNullableNumber(row, "cumulative_hours_at_trigger"),
    status,
    skillAttestationFormUrl: getNullableText(row, "skill_attestation_form_url"),
    hrDecisionDate: getNullableDate(row, "hr_decision_date"),
    hrNotes: getNullableText(row, "hr_notes"),
  });
  const existing = await database().tierReview.findFirst({ where: { timestamp, vaId } });
  if (existing) {
    await database().tierReview.update({ where: { id: existing.id }, data });
  } else {
    await database().tierReview.create({
      data: { ...data, timestamp, vaId },
    });
  }
  return true;
}

async function importCapacityFlagEvent(row: SheetRow): Promise<boolean> {
  const timestamp = getDate(row, "timestamp");
  const vaId = getText(row, "va_id");
  const flagType = getText(row, "flag_type");
  const transition = getText(row, "transition");
  if (!timestamp || !vaId || !flagType || !transition || !(await vaExists(vaId))) return false;
  const severity = getText(row, "severity") ?? (flagType === "overburdened" ? "red" : "yellow");
  const data = compact({
    timestamp,
    vaId,
    vaName: getNullableText(row, "va_name"),
    flagType,
    transition,
    severity,
    supervisorVaId: getNullableText(row, "supervisor_va_id"),
    notifiedAt: getNullableDate(row, "supervisor_notified_at", "notified_at"),
    notes: getNullableText(row, "notes"),
  });
  const existing = await database().capacityFlagEvent.findFirst({
    where: { timestamp, vaId, flagType, transition },
  });
  if (existing) {
    await database().capacityFlagEvent.update({ where: { id: existing.id }, data });
  } else {
    await database().capacityFlagEvent.create({
      data: { ...data, timestamp, vaId, flagType, transition, severity },
    });
  }
  return true;
}

async function importCandidate(row: SheetRow): Promise<boolean> {
  const candidateId = getText(row, "candidate_id");
  const email = normalizeEmail(getText(row, "email", "candidate_email"));
  if (!email) return false;
  const currentStage = getEnum(row, CANDIDATE_STAGES, normalizeLowerSnake, "current_stage");
  const data = compact({
    source: getNullableText(row, "source"),
    name: getNullableText(row, "name", "candidate_name"),
    email,
    country: getNullableText(row, "country"),
    resumeUrl: getNullableText(row, "resume_url"),
    skillsRoleTags: getNullableText(row, "skills_role_tags"),
    currentStage,
    aiSkillScore: getNullableNumber(row, "ai_skill_score"),
    commScore: getNullableNumber(row, "comm_score"),
    reliabilityScore: getNullableNumber(row, "reliability_score"),
    ownershipScore: getNullableNumber(row, "ownership_score"),
    skillFitScore: getNullableNumber(row, "skill_fit_score"),
    interviewerEmail: getNullableText(row, "interviewer_email"),
    interviewDate: getNullableDate(row, "interview_date"),
    interviewNotes: getNullableText(row, "interview_notes"),
    recruiterRecommendation: getNullableEnum(
      row,
      RECRUITER_RECOMMENDATIONS,
      normalizeLowerSnake,
      "recruiter_recommendation",
    ),
    finalDecision: getNullableEnum(row, FINAL_DECISIONS, normalizeLowerSnake, "final_decision"),
    decidedBy: getNullableText(row, "decided_by"),
    decidedAt: getNullableDate(row, "decided_at"),
    tenhrAssignmentTitle: getNullableText(row, "tenhr_assignment_title"),
    tenhrAssignmentLink: getNullableText(row, "tenhr_assignment_link"),
    tenhrResultUrl: getNullableText(row, "tenhr_result_url"),
    tenhrLoomUrl: getNullableText(row, "tenhr_loom_url"),
    tenhrQuizScore: getNullableNumber(row, "tenhr_quiz_score"),
    tenhrDeadline: getNullableDate(row, "tenhr_deadline"),
    tenhrGateResult: getNullableEnum(row, GATE_RESULTS, normalizeLowerSnake, "tenhr_gate_result"),
    gateReviewedBy: getNullableText(row, "gate_reviewed_by"),
    contractSentAt: getNullableDate(row, "contract_sent_at"),
    contractStatus: getNullableEnum(row, CONTRACT_STATUSES, normalizeLowerSnake, "contract_status"),
    contractDeadline: getNullableDate(row, "contract_deadline"),
    signedAt: getNullableDate(row, "signed_at"),
    bunnydocRequestId: getNullableText(row, "bunnydoc_request_id"),
    vaId: getNullableText(row, "va_id"),
    notionPageId: getNullableText(row, "notion_page_id"),
    followUpNotes: getNullableText(row, "follow_up_notes"),
    trainingAccessToken: getNullableText(row, "training_access_token"),
    trainingTotalMinutes: getInteger(row, "training_total_minutes"),
    trainingSessionCount: getInteger(row, "training_session_count"),
    trainingLastSessionAt: getNullableDate(row, "training_last_session_at"),
    trainingReadyForReview: getBoolean(row, "training_ready_for_review"),
  });

  const existingById = candidateId
    ? await database().candidate.findUnique({ where: { candidateId }, select: { candidateId: true } })
    : null;
  const existing =
    existingById ??
    (await database().candidate.findUnique({ where: { email }, select: { candidateId: true } }));

  if (existing) {
    await database().candidate.update({ where: { candidateId: existing.candidateId }, data });
    candidateCache.set(email, existing.candidateId);
    if (candidateId) candidateCache.set(candidateId, existing.candidateId);
  } else {
    const created = await database().candidate.create({
      data: compact({
        ...data,
        candidateId,
        createdAt: getDate(row, "created_at"),
        email,
        currentStage: currentStage ?? "applied",
      }),
      select: { candidateId: true },
    });
    candidateCache.set(email, created.candidateId);
    if (candidateId) candidateCache.set(candidateId, created.candidateId);
  }
  return true;
}

async function importTrainingSession(row: SheetRow): Promise<boolean> {
  const candidateId = await candidateIdFor(row);
  if (!candidateId) return false;
  const startTime = getDate(row, "start_time");
  const endTime = getDate(row, "end_time");
  const assignmentTitle = getText(row, "assignment_title");
  const sessionId =
    getText(row, "session_id") ??
    stableId("training_session", [
      candidateId,
      startTime?.toISOString(),
      endTime?.toISOString(),
      assignmentTitle,
    ]);
  const status = getEnum(row, SESSION_STATUSES, normalizeLowerSnake, "status");
  const reviewStatus = getEnum(row, REVIEW_STATUSES, normalizeLowerSnake, "review_status");
  const data = compact({
    candidateId,
    candidateEmail: getNullableText(row, "candidate_email", "email"),
    candidateName: getNullableText(row, "candidate_name", "name"),
    assignmentTitle: getNullableText(row, "assignment_title"),
    assignmentLink: getNullableText(row, "assignment_link"),
    startTime: getNullableDate(row, "start_time"),
    endTime: getNullableDate(row, "end_time"),
    durationMinutes: getNullableInteger(row, "duration_minutes"),
    status,
    workNotes: getNullableText(row, "work_notes"),
    reviewStatus,
    reviewNotes: getNullableText(row, "review_notes"),
    reviewedBy: getNullableText(row, "reviewed_by"),
    reviewedAt: getNullableDate(row, "reviewed_at"),
  });

  await database().trainingSession.upsert({
    where: { sessionId },
    update: data,
    create: {
      sessionId,
      candidateId,
      status: status ?? "active",
      reviewStatus: reviewStatus ?? "needs_review",
      candidateEmail: data.candidateEmail,
      candidateName: data.candidateName,
      assignmentTitle: data.assignmentTitle,
      assignmentLink: data.assignmentLink,
      startTime: data.startTime,
      endTime: data.endTime,
      durationMinutes: data.durationMinutes,
      workNotes: data.workNotes,
      reviewNotes: data.reviewNotes,
      reviewedBy: data.reviewedBy,
      reviewedAt: data.reviewedAt,
    },
  });
  return true;
}

async function importOnboarding(row: SheetRow): Promise<boolean> {
  const vaId = getText(row, "va_id");
  if (!vaId || !(await vaExists(vaId))) return false;
  const status = getEnum(row, ONBOARDING_STATUSES, normalizeLowerSnake, "status");
  const data = compact({
    vaName: getNullableText(row, "va_name", "name"),
    signedAt: getNullableDate(row, "signed_at"),
    status,
    gmailCreated: getBoolean(row, "gmail_created"),
    desklogCreated: getBoolean(row, "desklog_created"),
    whatsappAdded: getBoolean(row, "whatsapp_added"),
    contractUploaded: getBoolean(row, "contract_uploaded"),
    ndaUploaded: getBoolean(row, "nda_uploaded"),
    taxFormType: getNullableText(row, "tax_form_type"),
    taxFormDone: getBoolean(row, "tax_form_done"),
    paymentMethod: getNullableText(row, "payment_method"),
    paymentFormDone: getBoolean(row, "payment_form_done"),
    headshotUploaded: getBoolean(row, "headshot_uploaded"),
    handbookAck: getBoolean(row, "handbook_ack"),
    notionOnboardingPageId: getNullableText(row, "notion_onboarding_page_id"),
    notes: getNullableText(row, "notes"),
  });

  await database().onboarding.upsert({
    where: { vaId },
    update: data,
    create: compact({
      ...data,
      onboardingId: getText(row, "onboarding_id"),
      vaId,
      status: status ?? "pending",
    }),
  });
  return true;
}

async function importSetting(row: SheetRow): Promise<boolean> {
  const key = getText(row, "key");
  if (!key) return false;
  const value = getNullableText(row, "value");
  await database().setting.upsert({
    where: { key },
    update: { value, isSecret: isSecretKey(key) },
    create: { key, value, isSecret: isSecretKey(key) },
  });
  return true;
}

async function importPolicy(row: SheetRow): Promise<boolean> {
  const key = getText(row, "key");
  if (!key) return false;
  const data = compact({
    value: getNullableText(row, "value"),
    status: getNullableText(row, "status"),
    owner: getNullableText(row, "owner"),
    source: getNullableText(row, "source"),
    notes: getNullableText(row, "notes"),
  });
  await database().policy.upsert({
    where: { key },
    update: data,
    create: { key, ...data },
  });
  return true;
}

async function importNotionRef(row: SheetRow): Promise<boolean> {
  const refId = getText(row, "ref_id");
  if (!refId) return false;
  const data = compact({
    refType: getNullableText(row, "ref_type"),
    name: getNullableText(row, "name"),
    relatedRoleId: getNullableText(row, "related_role_id"),
    relatedVaId: getNullableText(row, "related_va_id"),
    notionUrl: getNullableText(row, "notion_url"),
    status: getNullableText(row, "status"),
    notes: getNullableText(row, "notes"),
    lastSyncedAt: getNullableDate(row, "last_synced_at"),
  });
  await database().notionRef.upsert({
    where: { refId },
    update: data,
    create: { refId, ...data },
  });
  return true;
}

async function importActivityLog(row: SheetRow): Promise<boolean> {
  const timestamp = getDate(row, "timestamp");
  const source = getText(row, "source");
  const eventType = getText(row, "event_type");
  const summaryText = getText(row, "summary");
  if (!timestamp || !source || !eventType || !summaryText) return false;
  const vaId = getNullableText(row, "va_id");
  const severity = getText(row, "severity") ?? "info";
  const data = compact({
    timestamp,
    source,
    eventType,
    vaId,
    severity,
    summary: summaryText,
  });
  const existing = await database().activityLog.findFirst({
    where: { timestamp, source, eventType, vaId, summary: summaryText },
  });
  if (existing) {
    await database().activityLog.update({ where: { id: existing.id }, data });
  } else {
    await database().activityLog.create({ data });
  }
  return true;
}

function printSummary(): void {
  console.log("\nSheet import summary:");
  for (const tabName of TAB_ORDER) {
    const value = summary.get(tabName);
    console.log(`${tabName}: ${value === "missing" ? "missing tab" : value ?? 0}`);
  }
}

async function main(): Promise<void> {
  const [{ env }, sheets, dbModule] = await Promise.all([
    import("../src/lib/env"),
    import("../src/lib/google/sheets"),
    import("../src/lib/db"),
  ]);
  db = dbModule.db;

  if (!env.SOURCE_SHEET_ID) {
    console.log("set SOURCE_SHEET_ID + GOOGLE_SERVICE_ACCOUNT_* to run");
    return;
  }

  const availableTabs = await sheets.listTabs(env.SOURCE_SHEET_ID);

  await importTab(
    env.SOURCE_SHEET_ID,
    availableTabs,
    sheets.readTab,
    "Compensation_Roles",
    importCompensationRole,
  );
  await importTab(env.SOURCE_SHEET_ID, availableTabs, sheets.readTab, "VA_Registry", importVa);
  await applySupervisorUpdates();
  await importTab(
    env.SOURCE_SHEET_ID,
    availableTabs,
    sheets.readTab,
    "Payroll_Periods",
    importPayrollPeriod,
  );
  // Append-log tables (multiple rows per va/day) — clear before re-import so a
  // re-run doesn't duplicate. Order: efficiency + hours both reference Va only.
  await database().deskLogHours.deleteMany({});
  await database().deskLogEfficiency.deleteMany({});
  await importTab(
    env.SOURCE_SHEET_ID,
    availableTabs,
    sheets.readTab,
    "DeskLog_Hours_Raw",
    importDeskLogHours,
  );
  await importTab(
    env.SOURCE_SHEET_ID,
    availableTabs,
    sheets.readTab,
    "DeskLog_Efficiency_Daily",
    importDeskLogEfficiency,
  );
  await importTab(
    env.SOURCE_SHEET_ID,
    availableTabs,
    sheets.readTab,
    "Payroll_Calculations",
    importPayrollCalculation,
  );
  await importTab(
    env.SOURCE_SHEET_ID,
    availableTabs,
    sheets.readTab,
    "Tier_Eligibility_Log",
    importTierReview,
  );
  await importTab(
    env.SOURCE_SHEET_ID,
    availableTabs,
    sheets.readTab,
    "Capacity_Flag_Events",
    importCapacityFlagEvent,
  );
  await importTab(
    env.SOURCE_SHEET_ID,
    availableTabs,
    sheets.readTab,
    "Recruitment_Pipeline",
    importCandidate,
  );
  await importTab(
    env.SOURCE_SHEET_ID,
    availableTabs,
    sheets.readTab,
    "Training_Time_Sessions",
    importTrainingSession,
  );
  await importTab(
    env.SOURCE_SHEET_ID,
    availableTabs,
    sheets.readTab,
    "Onboarding_Tracker",
    importOnboarding,
  );
  await importTab(env.SOURCE_SHEET_ID, availableTabs, sheets.readTab, "System_Config", importSetting);
  await importTab(env.SOURCE_SHEET_ID, availableTabs, sheets.readTab, "Policy_Config", importPolicy);
  await importTab(env.SOURCE_SHEET_ID, availableTabs, sheets.readTab, "Notion_Refs", importNotionRef);
  await importTab(env.SOURCE_SHEET_ID, availableTabs, sheets.readTab, "Activity_Log", importActivityLog);

  printSummary();
}

main()
  .then(async () => {
    await db?.$disconnect();
  })
  .catch(async (error) => {
    console.error(`Import failed: ${firstLine(error)}`);
    await db?.$disconnect();
    process.exit(1);
  });
