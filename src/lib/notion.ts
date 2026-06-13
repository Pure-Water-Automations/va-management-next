type JsonRecord = Record<string, unknown>;

export type NotionConfig = {
  token: string;
  version?: string;
};

export async function notionPatch(
  pageId: string,
  properties: JsonRecord,
  cfg: NotionConfig,
): Promise<JsonRecord> {
  return notionRequest("PATCH", `/pages/${normalizeNotionId(pageId)}`, { properties }, cfg);
}

export async function notionQuery(
  dataSourceId: string,
  body: JsonRecord,
  cfg: NotionConfig,
): Promise<JsonRecord[]> {
  const results: JsonRecord[] = [];
  let cursor: string | null = null;

  do {
    const payload: JsonRecord = { page_size: 100, ...body };
    if (cursor) payload.start_cursor = cursor;

    const page = await notionRequest(
      "POST",
      `/data_sources/${normalizeNotionId(dataSourceId)}/query`,
      payload,
      cfg,
    );

    const pageResults = Array.isArray(page.results) ? page.results : [];
    results.push(...pageResults.filter(isRecord));
    cursor = page.has_more === true && typeof page.next_cursor === "string" ? page.next_cursor : null;
  } while (cursor);

  return results;
}

export async function notionCreatePage(
  dataSourceId: string,
  properties: JsonRecord,
  cfg: NotionConfig,
): Promise<JsonRecord> {
  return notionRequest(
    "POST",
    "/pages",
    {
      parent: { data_source_id: normalizeNotionId(dataSourceId) },
      properties,
    },
    cfg,
  );
}

async function notionRequest(
  method: "PATCH" | "POST",
  path: string,
  payload: JsonRecord,
  cfg: NotionConfig,
): Promise<JsonRecord> {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      "Notion-Version": cfg.version ?? "2026-03-11",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Notion ${method} ${path} failed (${response.status}): ${text.slice(0, 300)}`);
  }

  if (!text) return {};
  const parsed = JSON.parse(text) as unknown;
  if (!isRecord(parsed)) return {};
  return parsed;
}

function normalizeNotionId(idOrUrl: string): string {
  const value = String(idOrUrl || "").replace("collection://", "").trim();
  const fromUrl = value.includes("notion.so/") || value.includes("notion.site/");
  const match = fromUrl
    ? value.match(/([a-f0-9]{32})(?:[?#].*)?$/i) ??
      value.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:[?#].*)?$/i)
    : value.replace(/-/g, "").match(/([a-f0-9]{32})/i);

  if (!match?.[1]) throw new Error(`Invalid Notion ID: ${idOrUrl}`);

  const compact = match[1].replace(/-/g, "");
  return [
    compact.slice(0, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
    compact.slice(20),
  ].join("-");
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
