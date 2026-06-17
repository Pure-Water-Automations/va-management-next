export type ParsedApplicationRow = {
  name: string;
  email: string;
  skillsRoleTags: string;
};

export function parseApplicationRows(values: unknown[][]): ParsedApplicationRow[] {
  const [headerRow, ...rows] = values;
  if (!headerRow) return [];

  const headers = headerRow.map((header) => normalizeHeader(header));
  const nameIndex = findHeaderIndex(headers, ["name", "fullname"]);
  const emailIndex = findHeaderIndex(headers, ["emailaddress", "email"]);
  const skillIndexes = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => header.includes("skill"))
    .map(({ index }) => index);

  return rows
    .filter((row) => row.some((cell) => cellToString(cell) !== ""))
    .map((row) => ({
      name: cellToString(nameIndex >= 0 ? row[nameIndex] : ""),
      email: cellToString(emailIndex >= 0 ? row[emailIndex] : ""),
      skillsRoleTags: skillIndexes.map((index) => cellToString(row[index])).filter(Boolean).join(", "),
    }));
}

function findHeaderIndex(headers: readonly string[], candidates: readonly string[]): number {
  return headers.findIndex((header) => candidates.includes(header));
}

function normalizeHeader(value: unknown): string {
  return cellToString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}
