// Pure custom-field logic (Pure Water OS Hub, Phase 1). No db/react imports so
// it can be unit-tested directly (tests/fields.test.ts).

export const FIELD_TYPES = ["TEXT", "SELECT", "DATE", "PERSON"] as const;
export type FieldTypeName = (typeof FIELD_TYPES)[number];

export function parseFieldType(v: unknown): FieldTypeName {
  const t = typeof v === "string" ? v.trim().toUpperCase() : "TEXT";
  if ((FIELD_TYPES as readonly string[]).includes(t)) return t as FieldTypeName;
  throw new Error(`Unknown field type "${String(v)}" (expected ${FIELD_TYPES.join("/")})`);
}

/** Normalize a SELECT options payload: array (or comma-string) → trimmed, deduped. */
export function parseOptions(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const s = String(item).trim();
    if (s && !seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      out.push(s);
    }
  }
  return out;
}

/** The design's click-to-cycle behavior on SELECT pills. */
export function nextOption(options: string[], current: string | null): string | null {
  if (options.length === 0) return null;
  const i = current ? options.indexOf(current) : -1;
  return options[(i + 1) % options.length];
}

/**
 * Validate + normalize a field value for storage. Empty input never reaches
 * here — the action treats "" as "clear the value" and deletes the row.
 */
export function validateFieldValue(
  type: FieldTypeName,
  options: string[],
  value: string,
): string {
  const v = value.trim();
  if (!v) throw new Error("Value cannot be empty");
  switch (type) {
    case "SELECT":
      if (options.length > 0 && !options.includes(v))
        throw new Error(`"${v}" is not one of this field's options (${options.join(", ")})`);
      return v;
    case "DATE": {
      const d = new Date(v);
      if (isNaN(d.getTime())) throw new Error(`"${v}" is not a date`);
      return d.toISOString().slice(0, 10); // store as YYYY-MM-DD
    }
    default:
      return v; // TEXT / PERSON: free text
  }
}
