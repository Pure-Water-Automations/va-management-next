import { readFile, readdir } from "node:fs/promises";
import { resolve, relative, sep, join } from "node:path";

const ROOT = process.cwd();
const ALLOW_DIRS = ["src", "prisma", "worker", "tests", "scripts"];
const ALLOW_FILES = ["package.json", "tsconfig.json", "AGENTS.md", "README.md"];
const DENY = [
  /\.env/i, /\.secrets/i, /secret/i, /token/i, /credential/i, /service-account/i,
  /\.(pem|key)$/i, /(^|\/)node_modules(\/|$)/, /(^|\/)\.next(\/|$)/, /(^|\/)\.git(\/|$)/,
];
const MAX_READ = 16_000;
const MAX_HITS = 40;

/** Resolve a project-relative path, rejecting traversal, secrets, and non-allowed areas. */
export function safePath(p: string): string {
  const rel = (p || "").replace(/^\.?\/+/, "");
  const abs = resolve(ROOT, rel);
  if (abs !== ROOT && !abs.startsWith(ROOT + sep)) throw new Error("Path is outside the project.");
  const r = relative(ROOT, abs);
  if (DENY.some((re) => re.test("/" + r))) throw new Error("That path is off-limits — secrets are never readable.");
  const top = r.split(sep)[0];
  if (!ALLOW_DIRS.includes(top) && !ALLOW_FILES.includes(r)) {
    throw new Error(`Only these areas are readable: ${ALLOW_DIRS.join(", ")} (and ${ALLOW_FILES.join(", ")}).`);
  }
  return abs;
}

export async function listSource(dir: string): Promise<string> {
  const abs = safePath(dir || "src");
  const entries = await readdir(abs, { withFileTypes: true });
  return entries
    .filter((e) => !DENY.some((re) => re.test("/" + e.name)))
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
    .sort()
    .join("\n");
}

export async function readSource(path: string): Promise<string> {
  const abs = safePath(path);
  const txt = await readFile(abs, "utf8");
  return txt.length > MAX_READ ? txt.slice(0, MAX_READ) + "\n…(truncated)" : txt;
}

async function walk(dir: string, out: string[], depth = 0): Promise<void> {
  if (depth > 6 || out.length >= 4000) return;
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = join(dir, e.name);
    const r = relative(ROOT, full);
    if (DENY.some((re) => re.test("/" + r))) continue;
    if (e.isDirectory()) await walk(full, out, depth + 1);
    else if (/\.(ts|tsx|js|jsx|prisma|json|md|css)$/.test(e.name)) out.push(full);
  }
}

export async function searchSource(query: string): Promise<string> {
  const q = (query || "").trim();
  if (!q) return "Give me something to search for.";
  const files: string[] = [];
  for (const d of ALLOW_DIRS) await walk(resolve(ROOT, d), files);
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const hits: string[] = [];
  for (const f of files) {
    let txt = "";
    try { txt = await readFile(f, "utf8"); } catch { continue; }
    const lines = txt.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        hits.push(`${relative(ROOT, f)}:${i + 1}: ${lines[i].trim().slice(0, 160)}`);
        if (hits.length >= MAX_HITS) return hits.join("\n") + `\n…(showing first ${MAX_HITS})`;
      }
    }
  }
  return hits.length ? hits.join("\n") : `No matches for "${q}".`;
}

const def = (name: string, description: string, properties: object, required: string[]) =>
  ({ type: "function" as const, function: { name, description, parameters: { type: "object", properties, required } } });

export const CODE_TOOLS = [
  def("list_source", "List files/folders in a project source directory (e.g. 'src/lib').", { dir: { type: "string" } }, []),
  def("search_source", "Search the source code for a string/identifier; returns file:line matches.", { query: { type: "string" } }, ["query"]),
  def("read_source", "Read a source file's contents (e.g. 'src/lib/services/payroll-calc.ts').", { path: { type: "string" } }, ["path"]),
];

const CODE_NAMES = new Set(["list_source", "search_source", "read_source"]);
export function isCodeTool(name: string): boolean { return CODE_NAMES.has(name); }

export async function runCodeTool(name: string, args: Record<string, unknown>): Promise<string> {
  try {
    if (name === "list_source") return await listSource(String(args.dir ?? "src"));
    if (name === "search_source") return await searchSource(String(args.query ?? ""));
    if (name === "read_source") return await readSource(String(args.path ?? ""));
    return `Unknown code tool: ${name}`;
  } catch (err) {
    return err instanceof Error ? err.message : "Couldn't read that.";
  }
}
