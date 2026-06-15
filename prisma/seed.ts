import { loadEnvConfig } from "@next/env";
import { DEFAULT_CONTRACT_TEMPLATE_HTML } from "../src/lib/contract/seed-template";

loadEnvConfig(process.cwd());

type Db = typeof import("../src/lib/db").db;

let db: Db | undefined;

const users = [
  {
    email: "okamotomiak@gmail.com",
    name: "Justin Okamoto",
    role: "HR_MANAGER" as const,
  },
  // Add known operators here when their production emails are confirmed:
  // { email: "teamlead@example.com", name: "Team Lead", role: "TEAM_LEAD" as const },
  // { email: "bookkeeper@example.com", name: "Bookkeeper", role: "BOOKKEEPER" as const },
  // { email: "recruiter@example.com", name: "Recruiter", role: "RECRUITER" as const },
];

const compensationRoles = [
  {
    roleId: "TRAINEE" as const,
    roleName: "Trainee",
    compensationType: "hourly" as const,
    hourlyRate: 3,
    salaryPerPeriod: null,
    onAdvancementTrack: true,
    minTotalHoursToReachNext: 40,
    nextRoleId: "TIER_1" as const,
    additionalRequirements: "Complete training gate and HR readiness review.",
    notes: "Dev default. The first gateway hours may be governed by Policy_Config.",
  },
  {
    roleId: "TIER_1" as const,
    roleName: "Tier 1 VA",
    compensationType: "hourly" as const,
    hourlyRate: 4,
    salaryPerPeriod: null,
    onAdvancementTrack: true,
    minTotalHoursToReachNext: 360,
    nextRoleId: "TIER_2" as const,
    additionalRequirements: "Consistent execution and supervisor approval.",
    notes: "Dev default hourly rate.",
  },
  {
    roleId: "TIER_2" as const,
    roleName: "Tier 2 VA",
    compensationType: "hourly" as const,
    hourlyRate: 5,
    salaryPerPeriod: null,
    onAdvancementTrack: true,
    minTotalHoursToReachNext: 720,
    nextRoleId: "TIER_3" as const,
    additionalRequirements: "Reliable ownership of recurring client work.",
    notes: "Dev default hourly rate.",
  },
  {
    roleId: "TIER_3" as const,
    roleName: "Tier 3 Senior VA",
    compensationType: "hourly" as const,
    hourlyRate: 7,
    salaryPerPeriod: null,
    onAdvancementTrack: true,
    minTotalHoursToReachNext: 1440,
    nextRoleId: "TIER_4" as const,
    additionalRequirements: "Senior ownership, quality review, and leadership readiness.",
    notes: "Dev default hourly rate.",
  },
  {
    roleId: "TIER_4" as const,
    roleName: "Tier 4 Lead",
    compensationType: "salary" as const,
    hourlyRate: null,
    salaryPerPeriod: 600,
    onAdvancementTrack: false,
    minTotalHoursToReachNext: null,
    nextRoleId: null,
    additionalRequirements: "Leadership role. Production salary should be confirmed by HR.",
    notes: "Dev default salary per payroll period.",
  },
];

async function main(): Promise<void> {
  const dbModule = await import("../src/lib/db");
  db = dbModule.db;

  for (const user of users) {
    const existing = await db.user.findUnique({ where: { email: user.email }, select: { id: true } });
    await db.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        role: user.role,
        active: true,
      },
      create: {
        email: user.email,
        name: user.name,
        role: user.role,
        active: true,
      },
    });
    console.log(`${existing ? "updated" : "created"} User ${user.email} (${user.role})`);
  }

  for (const role of compensationRoles) {
    const existing = await db.compensationRole.findUnique({
      where: { roleId: role.roleId },
      select: { roleId: true },
    });
    await db.compensationRole.upsert({
      where: { roleId: role.roleId },
      update: {
        roleName: role.roleName,
        compensationType: role.compensationType,
        hourlyRate: role.hourlyRate,
        salaryPerPeriod: role.salaryPerPeriod,
        onAdvancementTrack: role.onAdvancementTrack,
        minTotalHoursToReachNext: role.minTotalHoursToReachNext,
        nextRoleId: role.nextRoleId,
        additionalRequirements: role.additionalRequirements,
        notes: role.notes,
      },
      create: role,
    });
    console.log(`${existing ? "updated" : "created"} CompensationRole ${role.roleId}`);
  }

  const settingDefaults: [string, string][] = [
    ["contract_template_html", DEFAULT_CONTRACT_TEMPLATE_HTML],
    ["company_name", "Pure Water Automations"],
    ["contract_role_label", "Virtual Assistant"],
    // Signed-contract archive: Drive folder /PWA-VA Files/VA- Contracts.
    // The service account must be shared as Editor or archiving best-effort no-ops.
    ["signed_contracts_folder_id", "1oqdrz3HDu8WBGiCw9Y8eL_Lr6jUHY49S"],
  ];
  for (const [key, value] of settingDefaults) {
    await db.setting.upsert({ where: { key }, update: {}, create: { key, value } });
    console.log(`upserted Setting ${key}`);
  }
}

main()
  .then(async () => {
    await db?.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await db?.$disconnect();
    process.exit(1);
  });
