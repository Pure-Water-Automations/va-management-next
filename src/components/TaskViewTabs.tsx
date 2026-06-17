const HREFS: Record<string, string> = {
  list: "/hr/tasks",
  board: "/hr/tasks/board",
  calendar: "/hr/tasks/calendar",
};

/** List / Board / Calendar switcher shared across the task views. */
export function TaskViewTabs({ current }: { current: "list" | "board" | "calendar" }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
      {(["list", "board", "calendar"] as const).map((key) => {
        const active = key === current;
        return (
          <a
            key={key}
            href={HREFS[key]}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              textTransform: "capitalize",
              textDecoration: "none",
              background: active ? "var(--color-navy-900)" : "var(--color-bg-secondary)",
              color: active ? "#fff" : "var(--color-text-secondary)",
              border: "1px solid var(--color-border)",
            }}
          >
            {key}
          </a>
        );
      })}
    </div>
  );
}
