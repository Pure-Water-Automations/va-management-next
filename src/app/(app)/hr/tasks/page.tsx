import { getCurrentUser } from "@/lib/auth/access";
import { getAllTasks } from "@/lib/reads/tasks";
import { getSavedViews } from "@/lib/reads/views";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/task-format";
import { TasksWorkspace } from "@/components/TasksWorkspace";
import { TaskViewTabs } from "@/components/TaskViewTabs";
import { SavedViewsBar } from "@/components/SavedViewsBar";

export const dynamic = "force-dynamic";

type SortKey = "title" | "assignee" | "project" | "priority" | "status" | "due";
type SortDir = "asc" | "desc";

const SORT_KEYS: readonly SortKey[] = [
  "title",
  "assignee",
  "project",
  "priority",
  "status",
  "due",
];

const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
const STATUS_RANK: Record<string, number> = {
  Blocked: 0,
  InProgress: 1,
  NotStarted: 2,
  Done: 3,
};

const STATUS_FILTERS = ["NotStarted", "InProgress", "Blocked", "Done"] as const;

type GroupKey = "project" | "assignee" | "status";
const GROUP_KEYS: readonly GroupKey[] = ["project", "assignee", "status"];
const GROUP_OPTIONS: readonly { value: GroupKey | ""; label: string }[] = [
  { value: "", label: "None" },
  { value: "project", label: "Project" },
  { value: "assignee", label: "Assignee" },
  { value: "status", label: "Status" },
];

export default async function HrTasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    client?: string;
    va?: string;
    sort?: string;
    dir?: string;
    group?: string;
  }>;
}) {
  const {
    status,
    client,
    va,
    sort: rawSort,
    dir: rawDir,
    group: rawGroup,
  } = await searchParams;
  const user = await getCurrentUser();
  if (!user.caps.manageTasks) {
    return <p style={{ padding: 32 }}>Not authorized.</p>;
  }

  const sort: SortKey = SORT_KEYS.includes(rawSort as SortKey)
    ? (rawSort as SortKey)
    : "due";
  const dir: SortDir = rawDir === "desc" ? "desc" : "asc";
  const group: GroupKey | undefined = GROUP_KEYS.includes(rawGroup as GroupKey)
    ? (rawGroup as GroupKey)
    : undefined;

  const [tasks, vas, views] = await Promise.all([
    getAllTasks({
      ...(status ? { status } : {}),
      ...(client ? { client } : {}),
      ...(va ? { assignedToId: va } : {}),
    }),
    db.user.findMany({
      where: { role: "VA", active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    getSavedViews(user.id, "tasks"),
  ]);

  // ── Server-side sort ───────────────────────────────────────────────────────
  const assigneeOf = (t: (typeof tasks)[number]) =>
    (t.assignedTo.name ?? t.assignedTo.email ?? "").toLowerCase();

  const sorted = [...tasks].sort((a, b) => {
    let cmp = 0;
    switch (sort) {
      case "title":
        cmp = (a.title ?? "").localeCompare(b.title ?? "");
        break;
      case "assignee":
        cmp = assigneeOf(a).localeCompare(assigneeOf(b));
        break;
      case "project":
        cmp = (a.project?.name ?? "").localeCompare(b.project?.name ?? "");
        break;
      case "priority":
        cmp =
          (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99);
        break;
      case "status":
        cmp = (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99);
        break;
      case "due": {
        // Null due dates always sort last (regardless of direction).
        const at = a.dueDate ? a.dueDate.getTime() : null;
        const bt = b.dueDate ? b.dueDate.getTime() : null;
        if (at === null && bt === null) cmp = 0;
        else if (at === null) return 1;
        else if (bt === null) return -1;
        else cmp = at - bt;
        break;
      }
    }
    return dir === "desc" ? -cmp : cmp;
  });

  // ── Helpers to build URLs while preserving other params ──────────────────────
  const baseParams: Record<string, string> = {};
  if (status) baseParams.status = status;
  if (client) baseParams.client = client;
  if (va) baseParams.va = va;

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams({ ...baseParams, sort, dir });
    if (group) params.set("group", group);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `/hr/tasks?${qs}` : "/hr/tasks";
  };

  // The active querystring (no leading "?"), used by the Saved Views bar.
  const currentParams = new URLSearchParams({ ...baseParams, sort, dir });
  if (group) currentParams.set("group", group);
  const currentQuery = currentParams.toString();

  const hasFilters = Boolean(status || client || va);

  // The client workspace builds sort-header links itself, preserving these filters.
  const baseQuery: Record<string, string> = {};
  if (status) baseQuery.status = status;
  if (client) baseQuery.client = client;
  if (va) baseQuery.va = va;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Projects</div>
          <h1>All Tasks</h1>
        </div>
        <a href="/hr/tasks/new" className="btn btn-primary" style={{ alignSelf: "center" }}>
          + Delegate Task
        </a>
      </div>

      <TaskViewTabs current="list" />

      <SavedViewsBar views={views} currentQuery={currentQuery} />

      {/* Filters */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {STATUS_FILTERS.map((s) => {
            const active = status === s;
            return (
              <a
                key={s}
                href={buildHref({ status: active ? undefined : s })}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: "1px solid var(--color-border)",
                  fontSize: "var(--text-sm)",
                  textDecoration: "none",
                  background: active ? "var(--color-sky-500)" : undefined,
                  color: active ? "#fff" : "var(--color-text-secondary)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {s.replace(/([a-z])([A-Z])/g, "$1 $2")}
              </a>
            );
          })}
        </div>

        {/* Assignee (VA) filter */}
        <form method="get" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {status && <input type="hidden" name="status" value={status} />}
          {client && <input type="hidden" name="client" value={client} />}
          <input type="hidden" name="sort" value={sort} />
          <input type="hidden" name="dir" value={dir} />
          <select
            name="va"
            defaultValue={va ?? ""}
            className="input"
            style={{ fontSize: "var(--text-sm)", padding: "4px 8px", maxWidth: 220 }}
          >
            <option value="">All assignees</option>
            {vas.map((u: { id: string; name: string | null; email: string | null }) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.email}
              </option>
            ))}
          </select>
          <button type="submit" className="btn" style={{ fontSize: "var(--text-sm)", padding: "4px 10px" }}>
            Filter
          </button>
        </form>

        {hasFilters && (
          <a
            href="/hr/tasks"
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--color-text-tertiary)",
              textDecoration: "underline",
            }}
          >
            Clear filters
          </a>
        )}

        {/* Grouping control (preserves status/client/va/sort/dir) */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          <span
            style={{
              fontSize: "var(--text-xs)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--color-text-tertiary)",
            }}
          >
            Group
          </span>
          {GROUP_OPTIONS.map((opt) => {
            const active = (group ?? "") === opt.value;
            return (
              <a
                key={opt.value || "none"}
                href={buildHref({ group: opt.value || undefined })}
                style={{
                  padding: "4px 10px",
                  borderRadius: 4,
                  border: "1px solid var(--color-border)",
                  fontSize: "var(--text-sm)",
                  textDecoration: "none",
                  background: active ? "var(--color-sky-500)" : undefined,
                  color: active ? "#fff" : "var(--color-text-secondary)",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {opt.label}
              </a>
            );
          })}
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState
          title="No tasks found"
          hint="Try clearing filters, or delegate a new task."
          ctaHref="/hr/tasks/new"
          ctaLabel="+ Delegate a task"
        />
      ) : (
        <Card padding={16}>
          <TasksWorkspace
            tasks={sorted}
            assignees={vas}
            sort={sort}
            dir={dir}
            baseQuery={baseQuery}
            group={group}
          />
        </Card>
      )}
    </>
  );
}
