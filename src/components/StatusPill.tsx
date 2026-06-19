import { Badge } from "@/components/ui/Badge";

// Human label for an enum-ish status/priority string: "TRIAGE_NEEDED" -> "Triage needed".
function label(raw: string) {
  const s = raw.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

type Variant = "default" | "sky" | "success" | "warning" | "danger" | "info";

function statusVariant(raw: string): Variant {
  const s = raw.toUpperCase();
  if (["DONE", "COMPLETED", "COMPLETE"].includes(s)) return "success";
  if (["ACTIVE", "ASSIGNED", "IN_PROGRESS", "IN PROGRESS"].includes(s)) return "sky";
  if (["DECLINED", "BLOCKED", "CANCELLED", "CANCELED"].includes(s)) return "danger";
  if (
    ["PLANNING", "RECEIVED", "TRIAGE_NEEDED", "READY_TO_ASSIGN", "TODO", "TO DO", "ON_HOLD"].includes(s)
  )
    return "warning";
  return "default";
}

/** Status badge that maps any project / task / request status to a design-system Badge. */
export function StatusPill({ status, size = "sm" }: { status: string; size?: "sm" | "md" }) {
  return (
    <Badge variant={statusVariant(status)} size={size} dot>
      {label(status)}
    </Badge>
  );
}

const PRIORITY_VARIANT: Record<string, Variant> = {
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "default",
};

/** Priority badge (Low / Medium / High). */
export function PriorityPill({ priority, size = "sm" }: { priority: string; size?: "sm" | "md" }) {
  return (
    <Badge variant={PRIORITY_VARIANT[priority.toUpperCase()] ?? "default"} size={size}>
      {label(priority)}
    </Badge>
  );
}
