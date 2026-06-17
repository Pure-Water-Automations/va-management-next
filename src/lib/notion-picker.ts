import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIRROR_DIR =
  process.env.NOTION_MIRROR_DIR ??
  "/Users/justinokamoto/SecondBrain/tools/notion-mirror/notion_raw";

export type SopEntry = { notionPageId: string; title: string; url: string };
export type TrainingEntry = { notionPageId: string; title: string; url: string };
export type ToolEntry = { notionPageId: string; title: string; url: string; category: string };

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim().replace(/^"(.*)"$/, "$1");
    result[key] = val;
  }
  return result;
}

function readNotionDb<T>(
  dbSlugPrefix: string,
  mapFn: (fm: Record<string, string>) => T | null,
): T[] {
  let dirs: string[];
  try {
    dirs = readdirSync(MIRROR_DIR).filter((d) => d.startsWith(dbSlugPrefix));
  } catch {
    return [];
  }
  const results: T[] = [];
  for (const dir of dirs) {
    const dirPath = join(MIRROR_DIR, dir);
    let files: string[];
    try {
      files = readdirSync(dirPath).filter((f) => f.endsWith(".md"));
    } catch {
      continue;
    }
    for (const file of files) {
      try {
        const content = readFileSync(join(dirPath, file), "utf8");
        const fm = parseFrontmatter(content);
        const entry = mapFn(fm);
        if (entry) results.push(entry);
      } catch {
        // skip unreadable files
      }
    }
  }
  return results;
}

export function readSopPicker(): SopEntry[] {
  return readNotionDb("sop-library--", (fm) => {
    if (!fm.notion_page_id || !fm.title || !fm.notion_url) return null;
    return { notionPageId: fm.notion_page_id, title: fm.title, url: fm.notion_url };
  });
}

export function readTrainingPicker(): TrainingEntry[] {
  return readNotionDb("training--", (fm) => {
    if (!fm.notion_page_id || !fm.title || !fm.notion_url) return null;
    return { notionPageId: fm.notion_page_id, title: fm.title, url: fm.notion_url };
  });
}

const STATIC_TOOLS: ToolEntry[] = [
  { notionPageId: "static-canva", title: "Canva", url: "https://canva.com", category: "Design" },
  { notionPageId: "static-chatgpt", title: "ChatGPT", url: "https://chat.openai.com", category: "AI" },
  { notionPageId: "static-claude", title: "Claude", url: "https://claude.ai", category: "AI" },
  { notionPageId: "static-claude-code", title: "Claude Code", url: "https://claude.ai/code", category: "Dev" },
  { notionPageId: "static-notion", title: "Notion", url: "https://notion.so", category: "Productivity" },
  { notionPageId: "static-gmail", title: "Gmail", url: "https://mail.google.com", category: "Communication" },
  { notionPageId: "static-gdocs", title: "Google Docs", url: "https://docs.google.com", category: "Productivity" },
  { notionPageId: "static-gsheets", title: "Google Sheets", url: "https://sheets.google.com", category: "Productivity" },
  { notionPageId: "static-gslides", title: "Google Slides", url: "https://slides.google.com", category: "Productivity" },
  { notionPageId: "static-loom", title: "Loom", url: "https://loom.com", category: "Communication" },
  { notionPageId: "static-zoom", title: "Zoom", url: "https://zoom.us", category: "Communication" },
  { notionPageId: "static-trello", title: "Trello", url: "https://trello.com", category: "Productivity" },
  { notionPageId: "static-slack", title: "Slack", url: "https://slack.com", category: "Communication" },
  { notionPageId: "static-figma", title: "Figma", url: "https://figma.com", category: "Design" },
  { notionPageId: "static-airtable", title: "Airtable", url: "https://airtable.com", category: "Productivity" },
];

export function readToolsPicker(): ToolEntry[] {
  const fromNotion = readNotionDb<ToolEntry>("tools--", (fm) => {
    if (!fm.notion_page_id || !fm.title || !fm.notion_url) return null;
    return {
      notionPageId: fm.notion_page_id,
      title: fm.title,
      url: fm.notion_url,
      category: fm.category ?? "Productivity",
    };
  });
  return fromNotion.length > 0 ? fromNotion : STATIC_TOOLS;
}
