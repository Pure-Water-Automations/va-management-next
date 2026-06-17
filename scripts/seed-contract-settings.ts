// Seeds ONLY the contract-related rows in the Setting table — safe to run on
// production (does NOT touch Users or CompensationRole pay rates, unlike the full
// prisma seed). Idempotent. The contract template is created only if absent, so an
// admin-edited template in /admin/contract is never overwritten.
import { db } from "@/lib/db";
import { DEFAULT_CONTRACT_TEMPLATE_HTML } from "@/lib/contract/seed-template";

const overwritable: [string, string][] = [
  ["company_name", "Pure Water Automations"],
  ["contract_role_label", "Virtual Assistant"],
  ["signed_contracts_folder_id", "1oqdrz3HDu8WBGiCw9Y8eL_Lr6jUHY49S"],
];

async function main(): Promise<void> {
  // Template: create if missing; preserve any admin edit.
  await db.setting.upsert({
    where: { key: "contract_template_html" },
    update: {},
    create: { key: "contract_template_html", value: DEFAULT_CONTRACT_TEMPLATE_HTML },
  });
  for (const [key, value] of overwritable) {
    await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  console.log("Contract settings seeded (Setting table only).");
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
