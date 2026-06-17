/** Trim, collapse to a string, and cap chat input. Returns "" if unusable. */
export function sanitizeChatText(input: unknown, max = 500): string {
  if (typeof input !== "string") return "";
  return input.trim().slice(0, max);
}
