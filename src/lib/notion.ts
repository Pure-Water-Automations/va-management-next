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

export async function notionGet(path: string, cfg: NotionConfig): Promise<JsonRecord> {
  return notionRequest("GET", path, undefined, cfg);
}

async function notionRequest(
  method: "GET" | "PATCH" | "POST",
  path: string,
  payload: JsonRecord | undefined,
  cfg: NotionConfig,
): Promise<JsonRecord> {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      "Notion-Version": cfg.version ?? "2026-03-11",
    },
    body: method === "GET" ? undefined : JSON.stringify(payload ?? {}),
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

export function notionNormalizeId(idOrUrl: string): string {
  return normalizeNotionId(idOrUrl);
}

// ── Database / data-source / page read helpers (operate on Notion JSON) ──────

/** GET /databases/{id} → its data sources [{id, name}] (2026 data-source API). */
export async function notionDatabaseDataSources(
  databaseIdOrUrl: string,
  cfg: NotionConfig,
): Promise<Array<{ id: string; name: string }>> {
  const db = await notionGet(`/databases/${normalizeNotionId(databaseIdOrUrl)}`, cfg);
  const sources = Array.isArray(db.data_sources) ? db.data_sources : [];
  return sources.filter(isRecord).map((s) => ({ id: String(s.id ?? ""), name: String(s.name ?? "") }));
}

/**
 * Resolve a user-pasted database id/URL to a queryable data_source_id. Falls back
 * to treating the input as a data-source id itself if the database lookup fails
 * (e.g. they pasted a data-source id directly).
 */
export async function notionResolveDataSourceId(databaseIdOrUrl: string, cfg: NotionConfig): Promise<string> {
  try {
    const sources = await notionDatabaseDataSources(databaseIdOrUrl, cfg);
    if (sources[0]?.id) return sources[0].id;
  } catch {
    // fall through — maybe they pasted a data-source id directly
  }
  return normalizeNotionId(databaseIdOrUrl);
}

export async function notionRetrieveDataSource(dataSourceId: string, cfg: NotionConfig): Promise<JsonRecord> {
  return notionGet(`/data_sources/${normalizeNotionId(dataSourceId)}`, cfg);
}

export async function notionRetrievePage(pageId: string, cfg: NotionConfig): Promise<JsonRecord> {
  return notionGet(`/pages/${normalizeNotionId(pageId)}`, cfg);
}

type StatusPropInfo = { name: string; type: "status" | "select"; options: string[] };

/** Find the status/select property to sync on a data source (prefer a given name). */
export function notionPickStatusProperty(dataSource: JsonRecord, preferredName?: string): StatusPropInfo | null {
  const props = isRecord(dataSource.properties) ? dataSource.properties : {};
  const entries = Object.entries(props).filter(([, v]) => isRecord(v));

  const readOptions = (def: JsonRecord, type: "status" | "select"): string[] => {
    const holder = isRecord(def[type]) ? (def[type] as JsonRecord) : {};
    const opts = Array.isArray(holder.options) ? holder.options : [];
    return opts.filter(isRecord).map((o) => String(o.name ?? "")).filter(Boolean);
  };

  if (preferredName) {
    const want = preferredName.trim().toLowerCase();
    const hit = entries.find(([name]) => name.trim().toLowerCase() === want);
    if (hit) {
      const def = hit[1] as JsonRecord;
      const type = def.type === "select" ? "select" : "status";
      return { name: hit[0], type, options: readOptions(def, type) };
    }
  }
  const statusProp = entries.find(([, def]) => (def as JsonRecord).type === "status");
  if (statusProp) {
    const def = statusProp[1] as JsonRecord;
    return { name: statusProp[0], type: "status", options: readOptions(def, "status") };
  }
  const selectProp = entries.find(([, def]) => (def as JsonRecord).type === "select");
  if (selectProp) {
    const def = selectProp[1] as JsonRecord;
    return { name: selectProp[0], type: "select", options: readOptions(def, "select") };
  }
  return null;
}

export function notionPickTitlePropertyName(dataSource: JsonRecord): string {
  const props = isRecord(dataSource.properties) ? dataSource.properties : {};
  for (const [name, def] of Object.entries(props)) {
    if (isRecord(def) && def.type === "title") return name;
  }
  return "Name";
}

/** Read the selected status/select option name from a page property. */
export function notionPageStatusName(page: JsonRecord, propName: string): string | null {
  const props = isRecord(page.properties) ? page.properties : {};
  const prop = isRecord(props[propName]) ? (props[propName] as JsonRecord) : null;
  if (!prop) return null;
  const holder = isRecord(prop.status) ? prop.status : isRecord(prop.select) ? prop.select : null;
  const name = holder && typeof holder.name === "string" ? holder.name : null;
  return name || null;
}

/** Read the page's title (any title-type property) as plain text. */
export function notionPageTitleText(page: JsonRecord): string {
  const props = isRecord(page.properties) ? page.properties : {};
  for (const def of Object.values(props)) {
    if (isRecord(def) && def.type === "title" && Array.isArray(def.title)) {
      return def.title
        .filter(isRecord)
        .map((t) => (typeof t.plain_text === "string" ? t.plain_text : ""))
        .join("")
        .trim();
    }
  }
  return "";
}

export function notionPageUrl(page: JsonRecord): string {
  return typeof page.url === "string" ? page.url : "";
}
export function notionPageIdOf(page: JsonRecord): string {
  return typeof page.id === "string" ? page.id : "";
}
export function notionPageLastEdited(page: JsonRecord): string | null {
  return typeof page.last_edited_time === "string" ? page.last_edited_time : null;
}

/** Build a properties payload that sets a status/select property to an option name. */
export function statusPropertyPayload(
  propName: string,
  propType: "status" | "select",
  optionName: string,
): JsonRecord {
  return { [propName]: propType === "status" ? { status: { name: optionName } } : { select: { name: optionName } } };
}

/** Build a properties payload that sets a title property to plain text. */
export function titlePropertyPayload(propName: string, text: string): JsonRecord {
  return { [propName]: { title: [{ text: { content: text } }] } };
}
