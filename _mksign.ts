import { db } from "@/lib/db";
import { markContractSent } from "@/lib/actions/recruitment";

const EMAIL = "smoke_ui_test@example.com";

async function clean() {
  const ex = await db.candidate.findUnique({ where: { email: EMAIL } });
  if (!ex) return;
  await db.contractSignature.deleteMany({ where: { candidateId: ex.candidateId } });
  if (ex.vaId) { await db.onboarding.deleteMany({ where: { vaId: ex.vaId } }); await db.va.deleteMany({ where: { vaId: ex.vaId } }); }
  await db.candidate.delete({ where: { candidateId: ex.candidateId } });
}

async function main() {
  await clean();
  const c = await db.candidate.create({ data: { email: EMAIL, name: "Jordan Rivera", currentStage: "tenhr_pass" } });
  const sent = await markContractSent(c.candidateId);
  console.log("TOKEN=" + sent.contractSignToken);
  console.log("URL=http://localhost:3032/sign/" + sent.contractSignToken);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
