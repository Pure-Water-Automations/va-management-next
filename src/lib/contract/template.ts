import type { Candidate, CompensationRole } from "@prisma/client";

export type ContractVars = {
  name: string;
  role: string;
  rate: string;
  date: string;
  deadline: string;
  company: string;
};

const TOKENS: (keyof ContractVars)[] = ["name", "role", "rate", "date", "deadline", "company"];

/** Replace {{token}} with the matching var; unknown tokens render empty. */
export function renderContract(templateHtml: string, vars: ContractVars): string {
  return templateHtml.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_m, key: string) =>
    TOKENS.includes(key as keyof ContractVars) ? vars[key as keyof ContractVars] ?? "" : "",
  );
}

function ymd(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

function money(n: number | null | undefined): string {
  return typeof n === "number" ? `$${n.toFixed(2)}/hr` : "";
}

/** Build the merge vars for a candidate at signing time. */
export function contractVarsForCandidate(
  candidate: Pick<Candidate, "name" | "email" | "contractDeadline">,
  trainee: Pick<CompensationRole, "hourlyRate"> | null,
  settings: Map<string, string>,
  now: Date,
): ContractVars {
  return {
    name: candidate.name?.trim() || candidate.email,
    role: settings.get("contract_role_label")?.trim() || "Virtual Assistant",
    rate: money(trainee?.hourlyRate ?? null),
    date: ymd(now),
    deadline: ymd(candidate.contractDeadline),
    company: settings.get("company_name")?.trim() || "Pure Water Automations",
  };
}
