import { sheets as sheetsApi } from "@googleapis/sheets";
import { getGoogleAuth } from "@/lib/google/auth";

async function client() {
  const auth = await getGoogleAuth();
  return sheetsApi({ version: "v4", auth });
}

/** Read one tab as a matrix of unformatted values. */
export async function readTab(spreadsheetId: string, range: string): Promise<unknown[][]> {
  const sheets = await client();
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  return result.data.values ?? [];
}

/** Read several tabs/ranges at once. */
export async function batchRead(
  spreadsheetId: string,
  ranges: string[],
): Promise<{ range: string; values: unknown[][] }[]> {
  const sheets = await client();
  const result = await sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  return (result.data.valueRanges ?? []).map((item) => ({
    range: item.range ?? "",
    values: item.values ?? [],
  }));
}

/** List visible tab titles. */
export async function listTabs(spreadsheetId: string): Promise<string[]> {
  const sheets = await client();
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: "sheets.properties.title" });
  return (meta.data.sheets ?? [])
    .map((s) => s.properties?.title ?? "")
    .filter(Boolean);
}

/**
 * Overwrite one tab with a header row + data rows (used by the mirror export).
 * Creates the tab if it does not exist, clears it, then writes values.
 */
export async function replaceTab(
  spreadsheetId: string,
  tabTitle: string,
  rows: (string | number | boolean | null)[][],
): Promise<void> {
  const sheets = await client();
  const existing = await listTabs(spreadsheetId);
  if (!existing.includes(tabTitle)) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tabTitle } } }] },
    });
  }
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${tabTitle}` });
  if (rows.length === 0) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabTitle}!A1`,
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });
}
