import { z } from "zod";

const optionalEnvString = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional(),
  );

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_BASE_URL: optionalEnvString(z.string().url()),
  DEV_AUTH_EMAIL: optionalEnvString(z.string().email()),
  GOOGLE_SERVICE_ACCOUNT_JSON: optionalEnvString(z.string().min(1)),
  GOOGLE_SERVICE_ACCOUNT_FILE: optionalEnvString(z.string().min(1)),
  SOURCE_SHEET_ID: optionalEnvString(z.string()),
  MIRROR_SHEET_ID: optionalEnvString(z.string()),
  APPLICATION_RESPONSES_SHEET_ID: optionalEnvString(z.string()),
  APPLICATION_RESPONSES_TAB: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().default("Form Responses 1"),
  ),
  GOOGLE_WORKSPACE_TOKEN_FILE: optionalEnvString(z.string()),
});

export const env = envSchema.parse(process.env);
