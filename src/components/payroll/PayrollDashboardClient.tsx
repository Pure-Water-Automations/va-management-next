"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { Avatar as GradientAvatar } from "@/components/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { IconChevronDown, IconChevronRight } from "@/components/icons";

type Period = {
  start: string;
  end: string;
  closeDate: string;
  status: "open" | "closed" | "paid";
};

type Status = "submitted" | "approved" | "excluded" | "paid";
type PaymentMethod = "WISE" | "REMITLY" | "PAYONEER" | "GREY";

type PayrollRow = {
  id: string;
  periodStart: string;
  periodEnd: string;
  vaId: string;
  name: string;
  compensationRole: string;
  compensationType: "hourly" | "salary";
  hoursInPeriod: number;
  hourlyRate: number | null;
  salaryPerPeriod: number | null;
  grossPay: number;
  rowStatus: Status;
  approvedByEmail: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  excludedReason: string | null;
  flagged: boolean;
  flagReasons: string[];
  payMethod: PaymentMethod | null;
  payCurrency: string;
  trusted: boolean;
  supervisorVaId: string | null;
  email: string | null;
};

type Tiles = {
  nextRun: string;
  totalGross: number;
  beingPaid: number;
  activeVaCount: number;
  statusCounts: Record<Status, number>;
};

type PastPeriod = {
  periodStart: string;
  periodEnd: string;
  closeDate: string;
  status: "closed" | "paid";
  periodTotalHours: number | null;
  periodTotalPayroll: number | null;
};

type RateChange = {
  id: string;
  vaId: string;
  vaName: string | null;
  currentRole: string | null;
  targetRole: string | null;
  hrDecisionDate: string | null;
};

type Breakdown = {
  byProject: {
    project: string;
    clientOrgName: string | null;
    mapped: boolean;
    hours: number;
    tasks: { task: string; hours: number }[];
  }[];
  needsReviewDays: number;
  efficiencyPct: number | null;
};

type BreakdownState = { loading: boolean; data?: Breakdown; error?: string };

type ApiResponse<T = unknown> = { ok: boolean; error?: string; result?: T };

const METHODS: PaymentMethod[] = ["WISE", "REMITLY", "PAYONEER", "GREY"];
const METHOD_LABELS: Record<PaymentMethod, string> = {
  WISE: "Wise",
  REMITLY: "Remitly",
  PAYONEER: "Payoneer",
  GREY: "Grey",
};
const STATUS_LABELS: Record<Status, string> = {
  submitted: "Submitted",
  approved: "Approved",
  excluded: "Excluded",
  paid: "Paid",
};
const STATUS_COLORS: Record<Status, { bg: string; fg: string }> = {
  submitted: { bg: "#fff3d4", fg: "#966200" },
  approved: { bg: "#d4f5e2", fg: "#1a7a4a" },
  excluded: { bg: "#e8e8ed", fg: "#48484a" },
  paid: { bg: "#c4eef9", fg: "#0d5e7e" },
};

export function PayrollDashboardClient({
  period,
  rows: initialRows,
  tiles,
  pastPeriods,
  rateChanges,
  canEditProfiles,
  canExcludeRows,
}: {
  period: Period | null;
  rows: PayrollRow[];
  tiles: Tiles;
  pastPeriods: PastPeriod[];
  rateChanges: RateChange[];
  canEditProfiles: boolean;
  canExcludeRows: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState<"all" | PaymentMethod | "none">("all");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [breakdowns, setBreakdowns] = useState<Record<string, BreakdownState>>({});
  const [openProjects, setOpenProjects] = useState<Record<string, boolean>>({});
  const [profileDrafts, setProfileDrafts] = useState<Record<string, { method: PaymentMethod; payoutCurrency: string }>>({});
  const { toast, show } = useToast();

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const tiers = useMemo(
    () => Array.from(new Set(rows.map((row) => row.compensationRole))).sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const nonExcludedTotal = rows.filter((row) => row.rowStatus !== "excluded").length;
  const approvedCount = rows.filter((row) => row.rowStatus === "approved").length;
  const bulkEligible = rows.filter((row) => row.rowStatus === "submitted" && row.trusted && !row.flagged);
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !row.name.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && row.rowStatus !== statusFilter) return false;
      if (tierFilter !== "all" && row.compensationRole !== tierFilter) return false;
      if (methodFilter === "none" && row.payMethod !== null) return false;
      if (methodFilter !== "all" && methodFilter !== "none" && row.payMethod !== methodFilter) return false;
      if (flaggedOnly && !row.flagged) return false;
      return true;
    });
  }, [flaggedOnly, methodFilter, rows, search, statusFilter, tierFilter]);

  async function toggleRow(row: PayrollRow) {
    const nextId = expandedId === row.id ? null : row.id;
    setExpandedId(nextId);
    if (nextId && period) {
      await loadBreakdown(row);
    }
  }

  async function loadBreakdown(row: PayrollRow) {
    if (!period) return;
    const key = breakdownKey(row.vaId, period);
    if (breakdowns[key]?.data || breakdowns[key]?.loading) return;
    setBreakdowns((current) => ({ ...current, [key]: { loading: true } }));
    try {
      const params = new URLSearchParams({ vaId: row.vaId, start: period.start, end: period.end });
      const res = await fetch(`/api/payroll/breakdown?${params.toString()}`);
      const data = (await res.json().catch(() => ({ ok: false, error: "Bad response" }))) as ApiResponse<Breakdown>;
      if (!res.ok || !data.ok || !data.result) {
        setBreakdowns((current) => ({
          ...current,
          [key]: { loading: false, error: data.error ?? "Breakdown failed." },
        }));
        return;
      }
      setBreakdowns((current) => ({ ...current, [key]: { loading: false, data: data.result } }));
    } catch {
      setBreakdowns((current) => ({ ...current, [key]: { loading: false, error: "Network error." } }));
    }
  }

  async function approveRow(row: PayrollRow) {
    const key = `approve:${row.id}`;
    setBusyKey(key);
    const res = await postJson<PayrollRow>("/api/payroll/rows", { op: "approve", id: row.id });
    setBusyKey(null);
    if (!res.ok) {
      show(res.error ?? "Approval failed.");
      return;
    }
    setRows((current) =>
      current.map((item) => (item.id === row.id ? { ...item, rowStatus: "approved", approvedAt: new Date().toISOString() } : item)),
    );
    show("Payroll row approved.");
    router.refresh();
  }

  async function excludeRow(row: PayrollRow) {
    const reason = window.prompt("Reason for exclusion", row.excludedReason ?? "Excluded by HR");
    if (!reason) return;
    const key = `exclude:${row.id}`;
    setBusyKey(key);
    const res = await postJson<PayrollRow>("/api/payroll/rows", { op: "exclude", id: row.id, reason });
    setBusyKey(null);
    if (!res.ok) {
      show(res.error ?? "Exclude failed.");
      return;
    }
    setRows((current) =>
      current.map((item) =>
        item.id === row.id
          ? { ...item, rowStatus: "excluded", excludedReason: reason, approvedAt: null, approvedByEmail: null }
          : item,
      ),
    );
    show("Payroll row excluded.");
    router.refresh();
  }

  async function bulkApproveTrusted() {
    if (bulkEligible.length === 0) return;
    const key = "bulk:trusted";
    setBusyKey(key);
    const res = await postJson<{ approved: number }>("/api/payroll/rows", { op: "bulk_approve_trusted" });
    setBusyKey(null);
    if (!res.ok) {
      show(res.error ?? "Bulk approval failed.");
      return;
    }
    const approved = res.result?.approved ?? 0;
    show(`${approved} trusted row${approved === 1 ? "" : "s"} approved.`);
    router.refresh();
  }

  function draftFor(row: PayrollRow) {
    return profileDrafts[row.vaId] ?? { method: row.payMethod ?? "WISE", payoutCurrency: row.payCurrency ?? "USD" };
  }

  function updateProfileDraft(vaId: string, patch: Partial<{ method: PaymentMethod; payoutCurrency: string }>) {
    setProfileDrafts((current) => {
      const row = rows.find((item) => item.vaId === vaId);
      const existing = current[vaId] ?? { method: row?.payMethod ?? "WISE", payoutCurrency: row?.payCurrency ?? "USD" };
      return { ...current, [vaId]: { ...existing, ...patch } };
    });
  }

  async function saveProfile(row: PayrollRow) {
    const draft = draftFor(row);
    const payoutCurrency = draft.payoutCurrency.toUpperCase();
    if (payoutCurrency.length !== 3) return;
    const key = `profile:${row.vaId}`;
    setBusyKey(key);
    const res = await postJson("/api/payroll/rows", {
      op: "set_payment_profile",
      vaId: row.vaId,
      method: draft.method,
      payoutCurrency,
    });
    setBusyKey(null);
    if (!res.ok) {
      show(res.error ?? "Payment profile failed.");
      return;
    }
    setRows((current) =>
      current.map((item) => (item.vaId === row.vaId ? { ...item, payMethod: draft.method, payCurrency: payoutCurrency } : item)),
    );
    setProfileDrafts((current) => ({ ...current, [row.vaId]: { method: draft.method, payoutCurrency } }));
    show("Payment profile saved.");
    router.refresh();
  }

  return (
    <>
      <div style={{ display: "grid", gap: 20 }}>
        <StatGrid>
          <StatCard label="Next payroll run" value={dateShort(tiles.nextRun)} sub={daysUntil(tiles.nextRun)} hero />
          <StatCard label="Total payable" value={money2(tiles.totalGross)} sub="this period" />
          <StatCard label="VAs being paid" value={String(tiles.beingPaid)} sub={`of ${tiles.activeVaCount} active`} />
          <StatCard
            label="Approval progress"
            value={`${approvedCount}/${nonExcludedTotal}`}
            sub={`${tiles.statusCounts.submitted} submitted · ${tiles.statusCounts.approved} approved · ${tiles.statusCounts.paid} paid`}
            footer={<ProgressBar pct={nonExcludedTotal ? approvedCount / nonExcludedTotal : 0} />}
          />
        </StatGrid>

        <PeriodActions period={period} />

        {!period ? (
          <Card>
            <div className="small">No payroll periods found.</div>
          </Card>
        ) : (
          <Card padding={0} style={{ overflow: "hidden" }} tourEl="/payroll">
            <SectionHead
              title="VA payroll"
              count={visibleRows.length}
              action={
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busyKey === "bulk:trusted"}
                  disabled={bulkEligible.length === 0 || busyKey === "bulk:trusted"}
                  onClick={bulkApproveTrusted}
                >
                  Bulk approve trusted ({bulkEligible.length})
                </Button>
              }
            />
            <div style={toolbarStyle}>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search VA"
                style={{ ...inputStyle, minWidth: 220 }}
              />
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | Status)} style={selectStyle}>
                <option value="all">All statuses</option>
                <option value="submitted">Submitted</option>
                <option value="approved">Approved</option>
                <option value="excluded">Excluded</option>
                <option value="paid">Paid</option>
              </select>
              <select value={tierFilter} onChange={(event) => setTierFilter(event.target.value)} style={selectStyle}>
                <option value="all">All tiers</option>
                {tiers.map((tier) => (
                  <option key={tier} value={tier}>
                    {humanRole(tier)}
                  </option>
                ))}
              </select>
              <select
                value={methodFilter}
                onChange={(event) => setMethodFilter(event.target.value as "all" | PaymentMethod | "none")}
                style={selectStyle}
              >
                <option value="all">All methods</option>
                {METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
                <option value="none">—</option>
              </select>
              <label style={checkStyle}>
                <input type="checkbox" checked={flaggedOnly} onChange={(event) => setFlaggedOnly(event.target.checked)} />
                Flagged only
              </label>
            </div>

            <div style={{ overflowX: "auto" }}>
              <div style={tableStyle}>
                <div style={{ ...gridRowStyle, ...headRowStyle }}>
                  {["VA", "Tier", "Rate", "Hours", "Gross", "Currency", "Method", "Status"].map((heading) => (
                    <div key={heading} style={thStyle}>
                      {heading}
                    </div>
                  ))}
                </div>
                {visibleRows.map((row) => {
                  const expanded = expandedId === row.id;
                  const key = period ? breakdownKey(row.vaId, period) : "";
                  const breakdown = key ? breakdowns[key] : undefined;
                  return (
                    <Fragment key={row.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        aria-expanded={expanded}
                        onClick={() => toggleRow(row)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleRow(row);
                          }
                        }}
                        style={{ ...gridRowStyle, cursor: "pointer", background: expanded ? "var(--color-sky-50)" : "var(--color-surface)" }}
                      >
                        <div style={{ ...tdStyle, minWidth: 200 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            <span style={{ color: "var(--color-text-tertiary)" }}>
                              {expanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                            </span>
                            <GradientAvatar name={row.name} size={32} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{row.name}</span>
                                {row.flagged && (
                                  <span
                                    title={row.flagReasons.length ? row.flagReasons.join("; ") : "Flagged for review"}
                                    style={{ color: "#b7791f", fontSize: 14, lineHeight: 1 }}
                                  >
                                    ⚠
                                  </span>
                                )}
                              </div>
                              {row.email && <div style={metaTextStyle}>{row.email}</div>}
                            </div>
                          </div>
                        </div>
                        <div style={tdStyle}>
                          <Chip tone="gray">{humanRole(row.compensationRole)}</Chip>
                        </div>
                        <div style={tdStyle}>{rateLabel(row)}</div>
                        <div style={tdMonoStyle}>{hoursLabel(row.hoursInPeriod)}</div>
                        <div style={{ ...tdMonoStyle, fontWeight: 800 }}>{money2(row.grossPay)}</div>
                        <div style={tdStyle}>{row.payCurrency ?? "USD"}</div>
                        <div style={tdStyle}>
                          {row.payMethod ? <Chip tone="sky">{row.payMethod}</Chip> : <span style={dashStyle}>—</span>}
                        </div>
                        <div style={tdStyle}>
                          <StatusChip status={row.rowStatus} />
                        </div>
                      </div>

                      {expanded && (
                        <ExpandedPanel
                          row={row}
                          breakdown={breakdown}
                          period={period}
                          openProjects={openProjects}
                          setOpenProjects={setOpenProjects}
                          busyKey={busyKey}
                          canEditProfiles={canEditProfiles}
                          canExcludeRows={canExcludeRows}
                          draft={draftFor(row)}
                          onDraftChange={(patch) => updateProfileDraft(row.vaId, patch)}
                          onSaveProfile={() => saveProfile(row)}
                          onApprove={() => approveRow(row)}
                          onExclude={() => excludeRow(row)}
                        />
                      )}
                    </Fragment>
                  );
                })}
                {visibleRows.length === 0 && (
                  <div style={{ padding: 20, fontStyle: "italic", color: "var(--color-text-tertiary)" }}>
                    No payroll rows match the current filters.
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
          <PastPeriods periods={pastPeriods} />
          <RateChanges changes={rateChanges} />
        </div>
      </div>

      {toast && <Toast>{toast}</Toast>}
    </>
  );
}

function PeriodActions({ period }: { period: Period | null }) {
  if (!period) return null;
  return (
    <Card padding="14px 16px" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Badge variant={period.status === "open" ? "info" : period.status === "paid" ? "success" : "default"}>
          {period.status}
        </Badge>
        <span className="small">
          {dateRange(period.start, period.end)} · closes {dateShort(period.closeDate)}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Button size="sm" variant="ghost" href={`/api/payroll/export?period=${period.start.slice(0, 10)}`}>
          Export CSV
        </Button>
        {period.status === "open" && (
          <>
            <ActionButton path="/api/payroll/recalculate" body={{}} variant="ghost">
              Recalculate
            </ActionButton>
            <ActionButton
              path="/api/payroll/lock"
              body={{}}
              confirm="Lock this period? It will be marked closed and the bookkeeper emailed."
              variant="primary"
            >
              Lock & close
            </ActionButton>
          </>
        )}
        {period.status === "closed" && (
          <ActionButton
            path="/api/payroll/mark-paid"
            body={{ periodStart: period.start.slice(0, 10) }}
            confirm="Mark this period as paid?"
            variant="secondary"
          >
            Mark paid
          </ActionButton>
        )}
      </div>
    </Card>
  );
}

function ExpandedPanel({
  row,
  breakdown,
  period,
  openProjects,
  setOpenProjects,
  busyKey,
  canEditProfiles,
  canExcludeRows,
  draft,
  onDraftChange,
  onSaveProfile,
  onApprove,
  onExclude,
}: {
  row: PayrollRow;
  breakdown: BreakdownState | undefined;
  period: Period | null;
  openProjects: Record<string, boolean>;
  setOpenProjects: (updater: (current: Record<string, boolean>) => Record<string, boolean>) => void;
  busyKey: string | null;
  canEditProfiles: boolean;
  canExcludeRows: boolean;
  draft: { method: PaymentMethod; payoutCurrency: string };
  onDraftChange: (patch: Partial<{ method: PaymentMethod; payoutCurrency: string }>) => void;
  onSaveProfile: () => void;
  onApprove: () => void;
  onExclude: () => void;
}) {
  const approveKey = `approve:${row.id}`;
  const excludeKey = `exclude:${row.id}`;
  const profileKey = `profile:${row.vaId}`;
  return (
    <div style={expandedStyle}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 1fr) minmax(260px, 340px)", gap: 18, alignItems: "start" }}>
        <div>
          <div style={expandedTitleStyle}>Drill-down</div>
          {!period && <div className="small">No active period selected.</div>}
          {breakdown?.loading && <div className="small">Loading breakdown...</div>}
          {breakdown?.error && <div className="small" style={{ color: "var(--color-error)" }}>{breakdown.error}</div>}
          {breakdown?.data && (
            <div style={{ display: "grid", gap: 8 }}>
              <div className="small" style={{ color: "var(--color-text-secondary)" }}>
                {breakdown.data.needsReviewDays} review day{breakdown.data.needsReviewDays === 1 ? "" : "s"} · avg efficiency{" "}
                {breakdown.data.efficiencyPct == null ? "—" : `${Math.round(breakdown.data.efficiencyPct)}%`}
              </div>
              {row.flagged && (
                <div style={flagBoxStyle}>
                  {(row.flagReasons.length ? row.flagReasons : ["Flagged for review."]).map((reason) => (
                    <div key={reason}>{reason}</div>
                  ))}
                </div>
              )}
              {breakdown.data.byProject.map((project) => {
                const projectKey = `${row.id}:${project.project}`;
                const open = !!openProjects[projectKey];
                return (
                  <div key={project.project} style={projectBoxStyle}>
                    <button
                      type="button"
                      onClick={() => setOpenProjects((current) => ({ ...current, [projectKey]: !open }))}
                      style={projectButtonStyle}
                    >
                      <span style={{ color: "var(--color-text-tertiary)" }}>
                        {open ? <IconChevronDown size={15} /> : <IconChevronRight size={15} />}
                      </span>
                      <span style={{ fontWeight: 700 }}>{project.project}</span>
                      {project.mapped ? (
                        <Chip tone="sky">{project.clientOrgName ?? "Internal"}</Chip>
                      ) : (
                        <Chip style={{ background: "#fff3d4", color: "#966200", borderColor: "rgba(150,98,0,.18)" }}>
                          unmapped
                        </Chip>
                      )}
                      <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontWeight: 700 }}>{hoursLabel(project.hours)}</span>
                    </button>
                    {open && (
                      <div style={{ display: "grid", gap: 4, padding: "0 12px 10px 34px" }}>
                        {project.tasks.map((task) => (
                          <div key={task.task} style={taskLineStyle}>
                            <span>{task.task}</span>
                            <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>{hoursLabel(task.hours)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {breakdown.data.byProject.length === 0 && (
                <div className="small" style={{ fontStyle: "italic", color: "var(--color-text-tertiary)" }}>
                  No project hours found for this period.
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <div style={sideBoxStyle}>
            <div style={expandedTitleStyle}>Row actions</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Button
                size="sm"
                variant="primary"
                loading={busyKey === approveKey}
                disabled={row.rowStatus !== "submitted" || busyKey === approveKey}
                onClick={onApprove}
              >
                Approve
              </Button>
              {canExcludeRows && (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busyKey === excludeKey}
                  disabled={row.rowStatus === "excluded" || row.rowStatus === "paid" || busyKey === excludeKey}
                  onClick={onExclude}
                >
                  Exclude
                </Button>
              )}
            </div>
            {row.excludedReason && <div className="small" style={{ marginTop: 8 }}>Excluded: {row.excludedReason}</div>}
          </div>

          {canEditProfiles && (
            <div style={sideBoxStyle}>
              <div style={expandedTitleStyle}>Payment profile</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 92px auto", gap: 8, alignItems: "center" }}>
                <select
                  value={draft.method}
                  onChange={(event) => onDraftChange({ method: event.target.value as PaymentMethod })}
                  style={selectStyle}
                >
                  {METHODS.map((method) => (
                    <option key={method} value={method}>
                      {METHOD_LABELS[method]}
                    </option>
                  ))}
                </select>
                <input
                  value={draft.payoutCurrency}
                  onChange={(event) =>
                    onDraftChange({ payoutCurrency: event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) })
                  }
                  maxLength={3}
                  style={{ ...inputStyle, minWidth: 0, textTransform: "uppercase" }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busyKey === profileKey}
                  disabled={draft.payoutCurrency.length !== 3 || busyKey === profileKey}
                  onClick={onSaveProfile}
                >
                  Save
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PastPeriods({ periods }: { periods: PastPeriod[] }) {
  return (
    <Card padding={0} style={{ overflow: "hidden" }}>
      <SectionHead title="Recent periods" count={periods.length} />
      {periods.length === 0 ? (
        <EmptyBlock>No closed or paid periods yet.</EmptyBlock>
      ) : (
        periods.map((period) => (
          <div key={period.periodStart} style={listRowStyle}>
            <div>
              <div style={{ fontWeight: 700 }}>{dateRange(period.periodStart, period.periodEnd)}</div>
              <div style={metaTextStyle}>Closed {dateShort(period.closeDate)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{money2(period.periodTotalPayroll ?? 0)}</span>
              <Badge variant={period.status === "paid" ? "success" : "default"}>{period.status}</Badge>
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

function RateChanges({ changes }: { changes: RateChange[] }) {
  return (
    <Card padding={0} style={{ overflow: "hidden" }}>
      <SectionHead title="Rate-change history" count={changes.length} />
      {changes.length === 0 ? (
        <EmptyBlock>No approved rate changes yet.</EmptyBlock>
      ) : (
        changes.map((change) => (
          <div key={change.id} style={listRowStyle}>
            <div>
              <span style={{ fontWeight: 700 }}>{change.vaName ?? change.vaId}</span>{" "}
              <span className="small">
                {change.currentRole ? humanRole(change.currentRole) : "—"} → {change.targetRole ? humanRole(change.targetRole) : "—"}
              </span>
            </div>
            <span className="small" style={{ color: "var(--color-text-tertiary)" }}>
              {change.hrDecisionDate ? dateShort(change.hrDecisionDate) : ""}
            </span>
          </div>
        ))
      )}
    </Card>
  );
}

function SectionHead({ title, count, action }: { title: string; count: number; action?: ReactNode }) {
  return (
    <div style={sectionHeadStyle}>
      <h2 style={sectionTitleStyle}>
        {title}
        <Badge variant="default">{count}</Badge>
      </h2>
      {action}
    </div>
  );
}

function StatGrid({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>{children}</div>;
}

function StatCard({
  label,
  value,
  sub,
  footer,
  hero = false,
}: {
  label: string;
  value: string;
  sub: string;
  footer?: ReactNode;
  hero?: boolean;
}) {
  return (
    <Card variant={hero ? "navy" : "default"} padding={20}>
      <div style={{ fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800, opacity: hero ? 0.76 : 1, color: hero ? "#fff" : "var(--color-text-tertiary)" }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)", fontWeight: 800, marginTop: 8 }}>
        {value}
      </div>
      <div className="small" style={{ marginTop: 4, color: hero ? "rgba(255,255,255,.76)" : "var(--color-text-secondary)" }}>
        {sub}
      </div>
      {footer && <div style={{ marginTop: 14 }}>{footer}</div>}
    </Card>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div style={{ height: 8, borderRadius: 999, background: "var(--color-bg-tertiary)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${clamped * 100}%`, background: "var(--color-success)", borderRadius: 999 }} />
    </div>
  );
}

function Chip({ children, tone, style }: { children: ReactNode; tone?: "gray" | "sky"; style?: CSSProperties }) {
  const base =
    tone === "sky"
      ? { background: "var(--color-sky-50)", color: "var(--color-sky-700)", borderColor: "var(--color-sky-100)" }
      : { background: "var(--color-neutral-100)", color: "var(--color-neutral-700)", borderColor: "var(--color-neutral-200)" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: 22,
        padding: "0 9px",
        borderRadius: 999,
        border: "1px solid",
        fontSize: "var(--text-xs)",
        fontWeight: 700,
        lineHeight: 1,
        whiteSpace: "nowrap",
        ...base,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function StatusChip({ status }: { status: Status }) {
  const color = STATUS_COLORS[status];
  return (
    <Chip style={{ background: color.bg, color: color.fg, borderColor: "transparent" }}>
      {STATUS_LABELS[status]}
    </Chip>
  );
}

function Toast({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 28,
        transform: "translateX(-50%)",
        zIndex: 90,
        background: "var(--color-navy-900)",
        color: "#fff",
        fontSize: "var(--text-sm)",
        fontWeight: 600,
        padding: "11px 20px",
        borderRadius: 999,
        boxShadow: "var(--shadow-lg)",
        animation: "pwa-fade-in .2s ease both",
      }}
    >
      {children}
    </div>
  );
}

function EmptyBlock({ children }: { children: ReactNode }) {
  return <div style={{ padding: 20, fontStyle: "italic", color: "var(--color-text-tertiary)" }}>{children}</div>;
}

async function postJson<T = unknown>(path: string, body: Record<string, unknown>): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({ ok: false, error: "Bad response" }))) as ApiResponse<T>;
    if (!res.ok || !data.ok) return { ok: false, error: data.error ?? "Action failed" };
    return { ok: true, result: data.result };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  function show(message: string) {
    setToast(message);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setToast(null), 2400);
  }

  return { toast, show };
}

function breakdownKey(vaId: string, period: Period): string {
  return `${vaId}:${period.start}:${period.end}`;
}

function money2(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function moneyCompact(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value % 1 ? 2 : 0 });
}

function hoursLabel(value: number): string {
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: value % 1 ? 1 : 0 })}h`;
}

function rateLabel(row: PayrollRow): string {
  if (row.compensationType === "salary") return `${moneyCompact(row.salaryPerPeriod ?? 0)} /period`;
  return `${moneyCompact(row.hourlyRate ?? 0)}/hr`;
}

function humanRole(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function dateShort(value: string): string {
  return dateOnly(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dateRange(start: string, end: string): string {
  return `${dateShort(start)} - ${dateShort(end)}`;
}

function daysUntil(value: string): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const targetDate = dateOnly(value);
  const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate()).getTime();
  const days = Math.ceil((target - today) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "in 1 day";
  return `in ${days} days`;
}

function dateOnly(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return new Date(value);
  return new Date(year, month - 1, day);
}

const tableColumns = "minmax(200px,1.4fr) 110px 120px 90px 120px 110px 110px 120px";
const sectionHeadStyle: CSSProperties = {
  padding: "16px 20px",
  borderBottom: "1px solid var(--color-border)",
  background: "var(--color-bg-secondary)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};
const sectionTitleStyle: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "var(--text-xl)",
  margin: 0,
  display: "flex",
  alignItems: "center",
  gap: 10,
};
const toolbarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  padding: "14px 20px",
  borderBottom: "1px solid var(--color-border)",
};
const inputStyle: CSSProperties = {
  height: 38,
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-input)",
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  padding: "0 12px",
  font: "inherit",
  fontSize: "var(--text-sm)",
};
const selectStyle: CSSProperties = {
  height: 38,
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-input)",
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  padding: "0 12px",
  font: "inherit",
  fontSize: "var(--text-sm)",
};
const checkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  height: 38,
  padding: "0 8px",
  fontSize: "var(--text-sm)",
  fontWeight: 600,
  color: "var(--color-text-secondary)",
};
const tableStyle: CSSProperties = { minWidth: 980, fontSize: "var(--text-sm)" };
const gridRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: tableColumns,
  alignItems: "center",
  borderBottom: "1px solid var(--color-border-subtle)",
};
const headRowStyle: CSSProperties = { background: "var(--color-surface)" };
const thStyle: CSSProperties = {
  padding: "10px 14px",
  fontSize: "var(--text-xs)",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "var(--color-text-tertiary)",
  fontWeight: 800,
  whiteSpace: "nowrap",
};
const tdStyle: CSSProperties = {
  padding: "12px 14px",
  minWidth: 0,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const tdMonoStyle: CSSProperties = { ...tdStyle, fontFamily: "var(--font-mono)" };
const metaTextStyle: CSSProperties = {
  color: "var(--color-text-tertiary)",
  fontSize: "var(--text-xs)",
  marginTop: 2,
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const dashStyle: CSSProperties = { color: "var(--color-text-tertiary)", fontWeight: 700 };
const expandedStyle: CSSProperties = {
  padding: 18,
  background: "var(--color-bg-secondary)",
  borderBottom: "1px solid var(--color-border)",
};
const expandedTitleStyle: CSSProperties = {
  fontSize: "var(--text-xs)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--color-text-tertiary)",
  fontWeight: 800,
  marginBottom: 8,
};
const flagBoxStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  border: "1px solid rgba(150,98,0,.18)",
  background: "#fffaf0",
  color: "#966200",
  borderRadius: 8,
  padding: 10,
  fontSize: "var(--text-sm)",
};
const projectBoxStyle: CSSProperties = {
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  borderRadius: 8,
  overflow: "hidden",
};
const projectButtonStyle: CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: "none",
  background: "transparent",
  padding: "10px 12px",
  color: "var(--color-text-primary)",
  font: "inherit",
  fontSize: "var(--text-sm)",
  cursor: "pointer",
  textAlign: "left",
};
const taskLineStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  color: "var(--color-text-secondary)",
  fontSize: "var(--text-sm)",
  padding: "4px 0",
  borderTop: "1px solid var(--color-border-subtle)",
};
const sideBoxStyle: CSSProperties = {
  border: "1px solid var(--color-border)",
  background: "var(--color-surface)",
  borderRadius: 8,
  padding: 12,
};
const listRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "14px 20px",
  borderBottom: "1px solid var(--color-border-subtle)",
};
