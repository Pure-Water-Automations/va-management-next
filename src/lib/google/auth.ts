import { GoogleAuth } from "google-auth-library";
import { env } from "@/lib/env";

async function readServiceAccountFile(filePath: string) {
  const [{ readFile }, { isAbsolute, resolve }] = await Promise.all([
    import("fs/promises"),
    import("path"),
  ]);
  const resolvedPath = isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
  return JSON.parse(await readFile(resolvedPath, "utf8"));
}

/**
 * Service-account auth for Google Sheets.
 *
 * `spreadsheets` (read+write) scope is required because, unlike the Event
 * Planner Console (read-only import), this app ALSO writes the Postgres mirror
 * back into a dedicated Sheet. Write access still only matters on sheets the
 * service account is explicitly shared into (the source sheet stays read-only
 * in practice; the mirror sheet is shared as editor).
 */
export async function getGoogleAuth() {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON && !env.GOOGLE_SERVICE_ACCOUNT_FILE) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_FILE is missing");
  }

  const credentials = env.GOOGLE_SERVICE_ACCOUNT_FILE
    ? await readServiceAccountFile(env.GOOGLE_SERVICE_ACCOUNT_FILE)
    : JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "");

  return new GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}
