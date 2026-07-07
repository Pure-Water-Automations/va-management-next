// Pure block-editor logic (Pure Water OS Hub, Phase 2). No db/react imports so
// it can be unit-tested directly (tests/blocks.test.ts). A Page stores its
// blocks as one JSON array; every mutation here is immutable (returns a new
// array) so React state and the API layer can share the same functions.

export const BLOCK_KINDS = ["callout", "h2", "p", "todo", "ul", "ol", "code", "chip"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export type BlockRef = { type: "task" | "sop" | "video"; id: string };

export type Block = {
  id: string;
  kind: BlockKind;
  text: string;
  done?: boolean; // todo only
  ref?: BlockRef; // chip only
};

export const MAX_BLOCKS = 500;
export const MAX_TEXT = 10_000;

/**
 * Validate an untrusted blocks payload (API save). Throws on anything that
 * isn't a well-formed block array; trims oversized text instead of failing.
 */
export function sanitizeBlocks(input: unknown): Block[] {
  if (!Array.isArray(input)) throw new Error("blocks must be an array");
  if (input.length > MAX_BLOCKS) throw new Error(`Too many blocks (max ${MAX_BLOCKS})`);
  const seen = new Set<string>();
  return input.map((b, i) => {
    if (typeof b !== "object" || b === null) throw new Error(`Block ${i} is not an object`);
    const o = b as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id.trim() ? o.id : `b${i}`;
    if (seen.has(id)) throw new Error(`Duplicate block id "${id}"`);
    seen.add(id);
    const kind = String(o.kind) as BlockKind;
    if (!(BLOCK_KINDS as readonly string[]).includes(kind))
      throw new Error(`Block ${i}: unknown kind "${String(o.kind)}"`);
    const text = typeof o.text === "string" ? o.text.slice(0, MAX_TEXT) : "";
    const block: Block = { id, kind, text };
    if (kind === "todo") block.done = o.done === true;
    if (kind === "chip" && typeof o.ref === "object" && o.ref !== null) {
      const r = o.ref as Record<string, unknown>;
      if ((r.type === "task" || r.type === "sop" || r.type === "video") && typeof r.id === "string") {
        block.ref = { type: r.type, id: r.id };
      }
    }
    return block;
  });
}

/** Read a stored blocks JSON column defensively (bad rows render as empty docs). */
export function parseStoredBlocks(json: unknown): Block[] {
  try {
    return sanitizeBlocks(json);
  } catch {
    return [];
  }
}

// ── Immutable editor operations ──────────────────────────────────────────────

export function updateBlockText(blocks: Block[], id: string, text: string): Block[] {
  return blocks.map((b) => (b.id === id ? { ...b, text } : b));
}

export function toggleTodo(blocks: Block[], id: string): Block[] {
  return blocks.map((b) => (b.id === id && b.kind === "todo" ? { ...b, done: !b.done } : b));
}

export function appendBlock(blocks: Block[], block: Block): Block[] {
  return [...blocks, block];
}

export function removeBlock(blocks: Block[], id: string): Block[] {
  return blocks.filter((b) => b.id !== id);
}

/** Ordered-list numbering: consecutive `ol` runs restart at 1 after any other kind. */
export function olNumbers(blocks: Block[]): Record<string, number> {
  const out: Record<string, number> = {};
  let n = 0;
  for (const b of blocks) {
    if (b.kind === "ol") {
      n += 1;
      out[b.id] = n;
    } else {
      n = 0;
    }
  }
  return out;
}

// ── Slash commands ───────────────────────────────────────────────────────────

export type SlashCommand = {
  command: string;
  label: string;
  hint: string;
  icon: string;
  kind: BlockKind | "task";
};

export const SLASH_COMMANDS: SlashCommand[] = [
  { command: "task", label: "New task", hint: "Creates a real task + inserts a live chip", icon: "✅", kind: "task" },
  { command: "todo", label: "To-do", hint: "Checkbox item", icon: "☑️", kind: "todo" },
  { command: "bullet", label: "Bulleted list", hint: "Simple bullet", icon: "•", kind: "ul" },
  { command: "numbered", label: "Numbered list", hint: "1. 2. 3.", icon: "🔢", kind: "ol" },
  { command: "heading", label: "Heading", hint: "Section heading", icon: "H", kind: "h2" },
  { command: "callout", label: "Callout", hint: "Highlighted note", icon: "💧", kind: "callout" },
  { command: "code", label: "Code", hint: "Monospace block", icon: "{}", kind: "code" },
];

/**
 * Parse the new-block input. "/tas" → matching commands; "/task Ship it" →
 * command + remainder text. Returns null when the input isn't a slash query.
 */
export function parseSlashInput(input: string): { matches: SlashCommand[]; text: string } | null {
  if (!input.startsWith("/")) return null;
  const [word, ...rest] = input.slice(1).split(" ");
  const q = word.toLowerCase();
  const matches = SLASH_COMMANDS.filter(
    (c) => c.command.startsWith(q) || c.label.toLowerCase().includes(q),
  );
  return { matches, text: rest.join(" ").trim() };
}
