"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export type MappingOrg = { id: string; name: string };
export type MappingProject = {
  project: string;
  hours: number;
  mappedTo: { clientOrgId: string | null; clientOrgName: string } | null;
};

const PICK_VALUE = "__pick_client__";
const INTERNAL_VALUE = "";

async function postJson(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string; result?: unknown }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({ ok: false, error: "Bad response" }))) as {
      ok?: boolean;
      error?: string;
      result?: unknown;
    };
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

function hoursLabel(hours: number): string {
  return `${hours.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: hours % 1 ? 1 : 0 })}h`;
}

function clientLabel(orgs: MappingOrg[], clientOrgId: string | null): string {
  if (!clientOrgId) return "Internal (PWA)";
  return orgs.find((org) => org.id === clientOrgId)?.name ?? "Unknown client";
}

function MappingSelect({
  value,
  onChange,
  orgs,
  currentLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  orgs: MappingOrg[];
  currentLabel?: string;
}) {
  const currentOrgMissing = value !== PICK_VALUE && value !== INTERNAL_VALUE && !orgs.some((org) => org.id === value);
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} style={selectStyle}>
      <option value={PICK_VALUE}>— pick client —</option>
      <option value={INTERNAL_VALUE}>Internal (PWA)</option>
      {currentOrgMissing && <option value={value}>{currentLabel ?? "Unknown client"}</option>}
      {orgs.map((org) => (
        <option key={org.id} value={org.id}>
          {org.name}
        </option>
      ))}
    </select>
  );
}

export function ProjectMappingClient({ projects, orgs }: { projects: MappingProject[]; orgs: MappingOrg[] }) {
  const router = useRouter();
  const [items, setItems] = useState(projects);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const { toast, show } = useToast();

  useEffect(() => {
    setItems(projects);
  }, [projects]);

  const needsMapping = useMemo(
    () => items.filter((item) => !item.mappedTo).sort((a, b) => b.hours - a.hours || a.project.localeCompare(b.project)),
    [items],
  );
  const mapped = useMemo(
    () => items.filter((item) => item.mappedTo).sort((a, b) => a.project.localeCompare(b.project)),
    [items],
  );

  function choiceFor(project: MappingProject): string {
    return choices[project.project] ?? project.mappedTo?.clientOrgId ?? INTERNAL_VALUE;
  }

  function setChoice(project: string, value: string) {
    setChoices((current) => ({ ...current, [project]: value }));
  }

  async function mapProject(project: MappingProject) {
    const selected = choices[project.project] ?? PICK_VALUE;
    if (selected === PICK_VALUE) return;

    const key = `map:${project.project}`;
    setBusyKey(key);
    const res = await postJson("/api/payroll/mapping", {
      op: "map",
      project: project.project,
      clientOrgId: selected,
    });
    setBusyKey(null);

    if (!res.ok) {
      show(res.error ?? "Mapping failed.");
      return;
    }

    setItems((current) =>
      current.map((item) =>
        item.project === project.project
          ? { ...item, mappedTo: { clientOrgId: selected || null, clientOrgName: clientLabel(orgs, selected || null) } }
          : item,
      ),
    );
    setChoices((current) => {
      const next = { ...current };
      delete next[project.project];
      return next;
    });
    setEditingProject(null);
    show("Project mapped.");
    router.refresh();
  }

  async function unmapProject(project: MappingProject) {
    const key = `unmap:${project.project}`;
    setBusyKey(key);
    const res = await postJson("/api/payroll/mapping", { op: "unmap", project: project.project });
    setBusyKey(null);

    if (!res.ok) {
      show(res.error ?? "Unmap failed.");
      return;
    }

    setItems((current) =>
      current.map((item) => (item.project === project.project ? { ...item, mappedTo: null } : item)),
    );
    setEditingProject(null);
    show("Project unmapped.");
    router.refresh();
  }

  return (
    <>
      <div style={{ display: "grid", gap: 20 }}>
        <Card padding={0} style={{ overflow: "hidden" }}>
          <SectionHead title="Needs mapping" count={needsMapping.length} />
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Project</th>
                  <th style={thStyle}>Hours</th>
                  <th style={thStyle}>Client</th>
                  <th style={actionThStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {needsMapping.map((project) => {
                  const selected = choices[project.project] ?? PICK_VALUE;
                  const key = `map:${project.project}`;
                  return (
                    <tr key={project.project}>
                      <td style={projectTdStyle}>{project.project}</td>
                      <td style={tdStyle}>
                        <Badge variant="info">{hoursLabel(project.hours)}</Badge>
                      </td>
                      <td style={tdStyle}>
                        <MappingSelect
                          value={selected}
                          onChange={(value) => setChoice(project.project, value)}
                          orgs={orgs}
                        />
                      </td>
                      <td style={actionTdStyle}>
                        <Button
                          size="sm"
                          variant="primary"
                          loading={busyKey === key}
                          disabled={selected === PICK_VALUE || busyKey === key}
                          onClick={() => mapProject(project)}
                        >
                          Map
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {needsMapping.length === 0 && <EmptyRow colSpan={4}>No unmapped tracker projects in the last 120 days.</EmptyRow>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card padding={0} style={{ overflow: "hidden" }}>
          <SectionHead title="Mapped" count={mapped.length} />
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Project</th>
                  <th style={thStyle}>Hours</th>
                  <th style={thStyle}>Client</th>
                  <th style={actionThStyle}>Action</th>
                </tr>
              </thead>
              <tbody>
                {mapped.map((project) => {
                  const isEditing = editingProject === project.project;
                  const selected = isEditing ? choiceFor(project) : project.mappedTo?.clientOrgId ?? INTERNAL_VALUE;
                  const mapKey = `map:${project.project}`;
                  const unmapKey = `unmap:${project.project}`;
                  return (
                    <tr key={project.project}>
                      <td style={projectTdStyle}>{project.project}</td>
                      <td style={tdStyle}>
                        <Badge variant="info">{hoursLabel(project.hours)}</Badge>
                      </td>
                      <td style={tdStyle}>
                        {isEditing ? (
                          <MappingSelect
                            value={selected}
                            onChange={(value) => setChoice(project.project, value)}
                            orgs={orgs}
                            currentLabel={project.mappedTo?.clientOrgName}
                          />
                        ) : (
                          <Badge variant={project.mappedTo?.clientOrgId ? "primary" : "success"}>
                            {project.mappedTo?.clientOrgName}
                          </Badge>
                        )}
                      </td>
                      <td style={actionTdStyle}>
                        <div style={{ display: "inline-flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                          {isEditing ? (
                            <>
                              <Button
                                size="sm"
                                variant="primary"
                                loading={busyKey === mapKey}
                                disabled={selected === PICK_VALUE || busyKey === mapKey}
                                onClick={() => mapProject(project)}
                              >
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busyKey === mapKey}
                                onClick={() => {
                                  setEditingProject(null);
                                  setChoices((current) => {
                                    const next = { ...current };
                                    delete next[project.project];
                                    return next;
                                  });
                                }}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setChoice(project.project, project.mappedTo?.clientOrgId ?? INTERNAL_VALUE);
                                  setEditingProject(project.project);
                                }}
                              >
                                Change
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                loading={busyKey === unmapKey}
                                disabled={busyKey === unmapKey}
                                onClick={() => unmapProject(project)}
                              >
                                Unmap
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {mapped.length === 0 && <EmptyRow colSpan={4}>No mapped tracker projects yet.</EmptyRow>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {toast && (
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
          {toast}
        </div>
      )}
    </>
  );
}

function SectionHead({ title, count }: { title: string; count: number }) {
  return (
    <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-secondary)" }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
        {title}
        <Badge variant="default">{count}</Badge>
      </h2>
    </div>
  );
}

function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td style={{ ...tdStyle, fontStyle: "italic", color: "var(--color-text-tertiary)" }} colSpan={colSpan}>
        {children}
      </td>
    </tr>
  );
}

const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" };
const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "10px 16px",
  fontSize: "var(--text-xs)",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "var(--color-text-tertiary)",
  borderBottom: "1px solid var(--color-border)",
  whiteSpace: "nowrap",
};
const actionThStyle: CSSProperties = { ...thStyle, textAlign: "right" };
const tdStyle: CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid var(--color-border-subtle)",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};
const projectTdStyle: CSSProperties = {
  ...tdStyle,
  minWidth: 260,
  whiteSpace: "normal",
  overflowWrap: "anywhere",
  fontWeight: 600,
};
const actionTdStyle: CSSProperties = { ...tdStyle, textAlign: "right" };
const selectStyle: CSSProperties = {
  width: "min(340px, 100%)",
  minWidth: 220,
  height: 38,
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-input)",
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  padding: "0 12px",
  font: "inherit",
};
