"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SearchProject = { id: string; name: string };
type SearchTask = { id: string; title: string };
type SearchResponse = { projects: SearchProject[]; tasks: SearchTask[] };

type PaletteItem = {
  key: string;
  label: string;
  href: string;
  group: "Quick navigation" | "Projects" | "Tasks";
};

const QUICK_NAV: { label: string; href: string }[] = [
  { label: "Go to All Tasks", href: "/hr/tasks" },
  { label: "Task Board", href: "/hr/tasks/board" },
  { label: "Calendar", href: "/hr/tasks/calendar" },
  { label: "Projects", href: "/hr/projects" },
  { label: "Delegate task", href: "/hr/tasks/new" },
];

export function CommandPalette({ canDelegate = true }: { canDelegate?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<SearchResponse>({ projects: [], tasks: [] });
  const [active, setActive] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setDebouncedQuery("");
    setResults({ projects: [], tasks: [] });
    setActive(0);
  }, []);

  const navigate = useCallback(
    (href: string) => {
      close();
      // Client-side nav keeps the persistent shell (and its scroll) mounted.
      router.push(href);
    },
    [close, router],
  );

  // Global keyboard listener: open on Cmd/Ctrl+K, close on Esc.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isOpenCombo = (e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K");
      if (isOpenCombo) {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("open-command-palette", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("open-command-palette", onOpenEvent);
    };
  }, [open, close]);

  // Autofocus the input when the palette opens.
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Debounce the query (~200ms).
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => window.clearTimeout(id);
  }, [query]);

  // Fetch search results for the debounced query.
  useEffect(() => {
    if (!open) return;
    if (!debouncedQuery) {
      setResults({ projects: [], tasks: [] });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`);
        if (!res.ok) throw new Error(`search failed: ${res.status}`);
        const data = (await res.json()) as Partial<SearchResponse>;
        if (cancelled) return;
        setResults({
          projects: Array.isArray(data.projects) ? data.projects : [],
          tasks: Array.isArray(data.tasks) ? data.tasks : [],
        });
      } catch {
        // Fail gracefully: only quick-nav commands show.
        if (!cancelled) setResults({ projects: [], tasks: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, open]);

  // Build the flattened, filtered item list.
  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    // QUICK_NAV is entirely manager/delegation routes (/hr/tasks*, /hr/projects),
    // so hide them when the (effective) actor can't delegate — e.g. an admin
    // impersonating a plain VA, or a real non-delegating VA.
    const quick: PaletteItem[] = canDelegate
      ? QUICK_NAV.filter((c) => !q || c.label.toLowerCase().includes(q)).map((c) => ({
          key: `nav:${c.href}`,
          label: c.label,
          href: c.href,
          group: "Quick navigation" as const,
        }))
      : [];

    const projects: PaletteItem[] = results.projects.map((p) => ({
      key: `project:${p.id}`,
      label: p.name,
      href: `/hr/projects/${p.id}`,
      group: "Projects",
    }));

    const tasks: PaletteItem[] = results.tasks.map((t) => ({
      key: `task:${t.id}`,
      label: t.title,
      href: `/hr/tasks/${t.id}`,
      group: "Tasks",
    }));

    return [...quick, ...projects, ...tasks];
  }, [query, results, canDelegate]);

  // Keep the active index within bounds when the list changes.
  useEffect(() => {
    setActive((prev) => (items.length === 0 ? 0 : Math.min(prev, items.length - 1)));
  }, [items.length]);

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((prev) => (items.length === 0 ? 0 : (prev + 1) % items.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((prev) => (items.length === 0 ? 0 : (prev - 1 + items.length) % items.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[active];
      if (item) navigate(item.href);
    }
  }

  if (!open) return null;

  // Group rendering order with section labels.
  const groups: PaletteItem["group"][] = ["Quick navigation", "Projects", "Tasks"];
  const hasQuery = query.trim().length > 0;
  const showNoMatches = hasQuery && items.length === 0;

  let runningIndex = -1;

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: "12vh",
        background: "rgba(15, 23, 42, 0.45)",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        style={{
          width: "560px",
          maxWidth: "92vw",
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--color-bg-secondary, #ffffff)",
          border: "1px solid var(--color-border-subtle, #e2e8f0)",
          borderRadius: "12px",
          boxShadow: "var(--shadow-navy-sm, 0 12px 40px rgba(15,23,42,0.25))",
          fontFamily: "var(--font-sans, system-ui, sans-serif)",
          color: "var(--color-text-primary, #0f172a)",
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onInputKeyDown}
          placeholder="Search projects, tasks, or jump to…"
          aria-label="Search"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "16px 18px",
            fontSize: "var(--text-base, 1rem)",
            fontFamily: "inherit",
            color: "var(--color-text-primary, #0f172a)",
            background: "transparent",
            border: "none",
            borderBottom: "1px solid var(--color-border-subtle, #e2e8f0)",
            outline: "none",
          }}
        />

        <div style={{ overflowY: "auto", padding: "6px 0" }}>
          {showNoMatches ? (
            <div
              style={{
                padding: "16px 18px",
                fontSize: "var(--text-sm, 0.875rem)",
                color: "var(--color-text-tertiary, #94a3b8)",
              }}
            >
              No matches
            </div>
          ) : (
            groups.map((group) => {
              const groupItems = items.filter((it) => it.group === group);
              if (groupItems.length === 0) return null;
              return (
                <div key={group} style={{ padding: "4px 0" }}>
                  <div
                    style={{
                      padding: "8px 18px 4px",
                      fontSize: "var(--text-2xs, 0.6875rem)",
                      fontWeight: "var(--weight-medium, 600)" as React.CSSProperties["fontWeight"],
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--color-text-tertiary, #94a3b8)",
                    }}
                  >
                    {group}
                  </div>
                  {groupItems.map((item) => {
                    runningIndex += 1;
                    const isActive = runningIndex === active;
                    const idx = runningIndex;
                    return (
                      <div
                        key={item.key}
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActive(idx)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          navigate(item.href);
                        }}
                        style={{
                          padding: "9px 18px",
                          margin: "0 6px",
                          borderRadius: "8px",
                          cursor: "pointer",
                          fontSize: "var(--text-sm, 0.875rem)",
                          color: isActive
                            ? "var(--color-text-inverse, #ffffff)"
                            : "var(--color-text-primary, #0f172a)",
                          background: isActive
                            ? "var(--color-sky-500, #0ea5e9)"
                            : "transparent",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {item.label}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
