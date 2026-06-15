# Contract e-signing + onboarding fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dead BunnyDoc path with a self-contained in-app contract e-signer, and make onboarding completion advance the pipeline + welcome the VA.

**Architecture:** A tokenized public `/sign/[token]` page (same pattern as `/track`) lets a candidate read the contract, type their name + draw a signature, and submit. The server records an audit row, generates a signed PDF with `@react-pdf/renderer`, best-effort emails/archives it, then reuses the existing `markContractSigned` provisioning. `markContractSent` now actually emails the signing link. `onboarding.markComplete` advances the candidate stage and welcomes the VA.

**Tech Stack:** Next.js 15 (App Router), Prisma + Postgres, `@react-pdf/renderer` (pure-JS PDF, no Chromium), `signature_pad` (canvas capture), `@googleapis/drive` (already a dep), Gmail OAuth send (existing `sendSystemEmail`). Tests: `node --test` via `tsx` (existing `tests/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-06-15-contract-esign-and-onboarding-fix-design.md`

---

## File structure

**New files**
- `src/lib/contract/template.ts` — pure merge-field rendering + var resolution.
- `src/lib/contract/pdf.tsx` — `generateSignedPdf()` via react-pdf (HTML subset → PDF).
- `src/lib/contract/store.ts` — best-effort Drive archive + signed-PDF emails.
- `src/lib/contract/seed-template.ts` — the default contract HTML constant.
- `src/lib/actions/contract.ts` — `getSignState`, `signContract`, `saveContractTemplate`.
- `src/app/sign/[token]/page.tsx` + `src/app/sign/[token]/SignClient.tsx` — public signing UI.
- `src/app/api/sign/state/route.ts` + `src/app/api/sign/submit/route.ts` — public endpoints (token in body, mirrors `/api/training/state`).
- `src/app/(app)/admin/contract/page.tsx` + `src/components/ContractTemplateEditor.tsx` — admin editor.
- `src/app/api/admin/contract-template/route.ts` — save endpoint (admin-only).
- Tests: `tests/email-attachment.test.ts`, `tests/contract-template.test.ts`, `tests/contract-pdf.test.ts`, `tests/contract-sign.test.ts`, `tests/onboarding-complete.test.ts`.

**Modified files**
- `src/lib/email.ts` — add attachment support to `SystemEmailOptions` + MIME builder; export the builder for testing.
- `prisma/schema.prisma` — `Candidate.contractSignToken` + `ContractSignature` model.
- `src/lib/actions/recruitment.ts` — `markContractSent` generates a token + emails the link.
- `src/lib/actions/onboarding.ts` — `markComplete` advances stage + welcomes the VA.
- `prisma/seed.ts` — seed `contract_template_html`, `company_name`, `contract_role_label`.
- `src/components/Sidebar.tsx` — add "Contract template" admin nav link (optional, HR view).

**Note on deps:** the spec mentioned `pdf-lib`; it is **not** needed — `@react-pdf/renderer` embeds the signature image directly. Only `@react-pdf/renderer` and `signature_pad` are added.

---

## Task 1: Add dependencies

**Files:** `package.json` (via npm)

- [ ] **Step 1: Install**

Run:
```bash
npm install @react-pdf/renderer signature_pad
```
Expected: both added to `dependencies`; `npm install` exits 0.

- [ ] **Step 2: Verify the app still builds**

Run: `npm run typecheck`
Expected: exits 0 (no new type errors yet — nothing imports the deps).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add @react-pdf/renderer + signature_pad for in-app e-sign"
```

---

## Task 2: Email attachment support

**Files:**
- Modify: `src/lib/email.ts`
- Test: `tests/email-attachment.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/email-attachment.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMimeMessage } from "../src/lib/email";

test("buildMimeMessage wraps an attachment in multipart/mixed", () => {
  const raw = buildMimeMessage({
    from: "a@b.com",
    to: "c@d.com",
    subject: "Signed contract",
    body: "See attached.",
    attachments: [
      { filename: "contract.pdf", content: Buffer.from("%PDF-1.7 fake"), mimeType: "application/pdf" },
    ],
  });
  assert.match(raw, /Content-Type: multipart\/mixed; boundary=/);
  assert.match(raw, /Content-Type: application\/pdf/);
  assert.match(raw, /Content-Disposition: attachment; filename="contract.pdf"/);
  assert.match(raw, /Content-Transfer-Encoding: base64/);
  // base64 of "%PDF-1.7 fake"
  assert.match(raw, new RegExp(Buffer.from("%PDF-1.7 fake").toString("base64")));
});

test("buildMimeMessage with no attachment keeps plain text", () => {
  const raw = buildMimeMessage({ from: "a@b.com", to: "c@d.com", subject: "Hi", body: "Body" });
  assert.match(raw, /Content-Type: text\/plain/);
  assert.doesNotMatch(raw, /multipart\/mixed/);
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `npm test -- --test-name-pattern="buildMimeMessage"` (or `node --import tsx --test tests/email-attachment.test.ts`)
Expected: FAIL — `buildMimeMessage` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/email.ts`:

Add to `SystemEmailOptions` (after `htmlBody?`):
```ts
  attachments?: { filename: string; content: Buffer; mimeType: string }[];
```

Rename `buildRawMessage` → `buildMimeMessage`, export it, and add the mixed branch. Replace the whole function with:
```ts
export function buildMimeMessage(opts: SystemEmailOptions): string {
  const to = Array.isArray(opts.to) ? opts.to.join(", ") : opts.to;
  const headers = [
    ["From", sanitizeHeader(opts.from)],
    ["To", sanitizeHeader(to)],
    ["Subject", encodeHeaderWord(opts.subject)],
    ["MIME-Version", "1.0"],
  ];
  const headerLines = headers.map(([key, value]) => `${key}: ${value}`);

  const bodyPart = (): string[] => {
    if (!opts.htmlBody) {
      return ['Content-Type: text/plain; charset="UTF-8"', "", opts.body];
    }
    const alt = `alt-${Date.now().toString(36)}`;
    return [
      `Content-Type: multipart/alternative; boundary="${alt}"`,
      "",
      `--${alt}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      opts.body,
      `--${alt}`,
      'Content-Type: text/html; charset="UTF-8"',
      "",
      opts.htmlBody,
      `--${alt}--`,
    ];
  };

  if (!opts.attachments || opts.attachments.length === 0) {
    return [...headerLines, ...bodyPart(), ""].join("\r\n");
  }

  const mixed = `mixed-${Date.now().toString(36)}`;
  const parts: string[] = [
    ...headerLines,
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    ...bodyPart(),
  ];
  for (const a of opts.attachments) {
    parts.push(
      `--${mixed}`,
      `Content-Type: ${a.mimeType}; name="${a.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${a.filename}"`,
      "",
      a.content.toString("base64").replace(/(.{76})/g, "$1\r\n"),
    );
  }
  parts.push(`--${mixed}--`, "");
  return parts.join("\r\n");
}
```

Then update the one call site in `sendSystemEmail` (line ~67): `buildRawMessage(effective)` → `buildMimeMessage(effective)`.

- [ ] **Step 4: Run tests; verify pass**

Run: `node --import tsx --test tests/email-attachment.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/email.ts tests/email-attachment.test.ts
git commit -m "feat(email): support PDF attachments via multipart/mixed"
```

---

## Task 3: Prisma schema + migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the token field to Candidate**

In `model Candidate`, after `bunnydocRequestId String?`, add:
```prisma
  contractSignToken String? @unique
```

- [ ] **Step 2: Add the ContractSignature model**

After the `Candidate` model, add:
```prisma
model ContractSignature {
  id             String   @id @default(cuid())
  candidateId    String   @unique
  signerName     String
  signerEmail    String
  signedAt       DateTime @default(now())
  signerIp       String?
  userAgent      String?
  signatureImage String?  @db.Text
  templateHash   String
  pdfDriveFileId String?
  pdfWebViewLink String?
  createdAt      DateTime @default(now())
}
```

- [ ] **Step 3: Create the migration**

Run: `npm run prisma:dev -- --name contract_signing` (this is `prisma migrate dev --name contract_signing`)
Expected: a new folder under `prisma/migrations/…_contract_signing/` and `prisma generate` runs. (Requires `DATABASE_URL` to a reachable dev DB.)

- [ ] **Step 4: Verify generate + typecheck**

Run: `npm run prisma:generate && npm run typecheck`
Expected: exits 0; `ContractSignature` and `Candidate.contractSignToken` are now in the Prisma client types.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add contractSignToken + ContractSignature"
```

---

## Task 4: Contract template rendering

**Files:**
- Create: `src/lib/contract/seed-template.ts`
- Create: `src/lib/contract/template.ts`
- Test: `tests/contract-template.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/contract-template.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderContract, type ContractVars } from "../src/lib/contract/template";

const vars: ContractVars = {
  name: "Ana Cruz", role: "Virtual Assistant", rate: "$6.00/hr",
  date: "2026-06-15", deadline: "2026-06-22", company: "Pure Water Automations",
};

test("renderContract substitutes all known tokens", () => {
  const out = renderContract("<p>{{name}} joins {{company}} as a {{role}} at {{rate}}.</p>", vars);
  assert.equal(out, "<p>Ana Cruz joins Pure Water Automations as a Virtual Assistant at $6.00/hr.</p>");
});

test("renderContract blanks unknown tokens", () => {
  assert.equal(renderContract("<p>{{name}} {{unknown}}</p>", vars), "<p>Ana Cruz </p>");
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `node --import tsx --test tests/contract-template.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the default template**

Create `src/lib/contract/seed-template.ts`:
```ts
export const DEFAULT_CONTRACT_TEMPLATE_HTML = `
<h1>Virtual Assistant Engagement Letter</h1>
<p>This agreement is between {{company}} ("the Company") and {{name}} ("the Contractor"), dated {{date}}.</p>
<h2>1. Role</h2>
<p>The Contractor is engaged as a {{role}} on an independent-contractor basis.</p>
<h2>2. Compensation</h2>
<p>The Contractor will be paid {{rate}} for approved hours worked, processed each payroll period.</p>
<h2>3. Confidentiality</h2>
<p>The Contractor will keep all Company and client information confidential and use it only to perform the work.</p>
<h2>4. Term</h2>
<p>Either party may end this engagement with written notice. This offer must be signed by {{deadline}}.</p>
<p>By signing below, the Contractor confirms they have read and agree to this agreement.</p>
`.trim();
```

- [ ] **Step 4: Create the renderer**

Create `src/lib/contract/template.ts`:
```ts
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
```

- [ ] **Step 5: Run tests; verify pass**

Run: `node --import tsx --test tests/contract-template.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contract/template.ts src/lib/contract/seed-template.ts tests/contract-template.test.ts
git commit -m "feat(contract): merge-field template rendering"
```

---

## Task 5: Signed-PDF generation (react-pdf)

**Files:**
- Create: `src/lib/contract/pdf.tsx`
- Test: `tests/contract-pdf.test.ts`

> v1 renders the contract HTML subset as block structure (h1–h3, p, li, hr) in reading order; inline `<strong>`/`<em>` are flattened to plain text (visual emphasis in the PDF is a later refinement). The on-screen page still shows the full HTML.

- [ ] **Step 1: Write the failing test**

Create `tests/contract-pdf.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSignedPdf } from "../src/lib/contract/pdf";

test("generateSignedPdf returns a PDF buffer", async () => {
  const buf = await generateSignedPdf({
    contentHtml: "<h1>Agreement</h1><p>Ana Cruz agrees.</p><ul><li>Term one</li></ul>",
    signerName: "Ana Cruz",
    signatureImage: null,
    audit: { signedAt: "2026-06-15T10:00:00Z", signerIp: "1.2.3.4", userAgent: "test-agent", templateHash: "abc123", candidateId: "cand_1" },
  });
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf.length > 500);
  assert.equal(buf.subarray(0, 5).toString("latin1"), "%PDF-");
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `node --import tsx --test tests/contract-pdf.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/contract/pdf.tsx`:
```tsx
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

export type SignedPdfInput = {
  contentHtml: string;
  signerName: string;
  signatureImage: string | null; // data URL (image/png) or null
  audit: { signedAt: string; signerIp: string | null; userAgent: string | null; templateHash: string; candidateId: string };
};

type Block =
  | { type: "h1" | "h2" | "h3" | "p" | "li"; text: string }
  | { type: "hr" };

/** Minimal HTML-subset → blocks. Strips inline tags to text; keeps block order. */
function htmlToBlocks(html: string): Block[] {
  const blocks: Block[] = [];
  const re = /<(h1|h2|h3|p|li)>([\s\S]*?)<\/\1>|<hr\s*\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0].toLowerCase().startsWith("<hr")) { blocks.push({ type: "hr" }); continue; }
    const tag = m[1].toLowerCase() as "h1" | "h2" | "h3" | "p" | "li";
    const text = m[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    if (text) blocks.push({ type: tag, text });
  }
  return blocks;
}

const s = StyleSheet.create({
  page: { padding: 48, fontSize: 11, fontFamily: "Helvetica", lineHeight: 1.5, color: "#222" },
  h1: { fontSize: 18, marginBottom: 10, fontFamily: "Helvetica-Bold" },
  h2: { fontSize: 13, marginTop: 12, marginBottom: 4, fontFamily: "Helvetica-Bold" },
  h3: { fontSize: 12, marginTop: 8, marginBottom: 4, fontFamily: "Helvetica-Bold" },
  p: { marginBottom: 6 },
  li: { marginBottom: 3, marginLeft: 12 },
  hr: { borderBottomWidth: 1, borderBottomColor: "#ccc", marginVertical: 8 },
  sigBox: { marginTop: 28, borderTopWidth: 1, borderTopColor: "#222", paddingTop: 10 },
  sigImg: { height: 48, marginVertical: 6 },
  audit: { marginTop: 24, fontSize: 8, color: "#888" },
});

export async function generateSignedPdf(input: SignedPdfInput): Promise<Buffer> {
  const blocks = htmlToBlocks(input.contentHtml);
  const doc = (
    <Document>
      <Page size="A4" style={s.page}>
        {blocks.map((b, i) =>
          b.type === "hr" ? (
            <View key={i} style={s.hr} />
          ) : b.type === "li" ? (
            <Text key={i} style={s.li}>{"• " + b.text}</Text>
          ) : (
            <Text key={i} style={s[b.type]}>{b.text}</Text>
          ),
        )}
        <View style={s.sigBox}>
          <Text>Signed by: {input.signerName}</Text>
          {input.signatureImage ? <Image style={s.sigImg} src={input.signatureImage} /> : null}
          <Text>Date: {input.audit.signedAt}</Text>
        </View>
        <Text style={s.audit}>
          Audit — candidate {input.audit.candidateId} · IP {input.audit.signerIp ?? "n/a"} · {input.audit.userAgent ?? "n/a"} · template {input.audit.templateHash}
        </Text>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
```

> If `renderToBuffer` isn't exported in the installed react-pdf version, use `import { renderToBuffer } from "@react-pdf/renderer/lib/react-pdf.cjs"` or `pdf(doc).toBuffer()`. Confirm the export at execution time with `node -e "console.log(Object.keys(require('@react-pdf/renderer')))"`.

- [ ] **Step 4: Run tests; verify pass**

Run: `node --import tsx --test tests/contract-pdf.test.ts`
Expected: PASS — a `%PDF-` buffer over 500 bytes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contract/pdf.tsx tests/contract-pdf.test.ts
git commit -m "feat(contract): generate signed PDF with react-pdf"
```

---

## Task 6: Signed-PDF delivery (Drive + email), best-effort

**Files:**
- Create: `src/lib/contract/store.ts`

> No dedicated test: this module is all I/O (Drive + Gmail). It is `try/catch`-wrapped to never throw; correctness is covered by manual verification in Task 11 and by the sign-action test (Task 7) which mocks it.

- [ ] **Step 1: Implement**

Create `src/lib/contract/store.ts`:
```ts
import { drive as driveApi } from "@googleapis/drive";
import { GoogleAuth } from "google-auth-library";
import { Readable } from "node:stream";
import { env } from "@/lib/env";
import { sendSystemEmail } from "@/lib/email";

export type DeliveryResult = { pdfDriveFileId?: string; pdfWebViewLink?: string };

async function driveClient() {
  const creds = env.GOOGLE_SERVICE_ACCOUNT_FILE
    ? JSON.parse(await (await import("fs/promises")).readFile(env.GOOGLE_SERVICE_ACCOUNT_FILE, "utf8"))
    : JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON ?? "{}");
  const auth = new GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/drive.file"] });
  return driveApi({ version: "v3", auth });
}

/** Best-effort: never throws. Uploads to Drive (if folder configured) + emails the PDF. */
export async function deliverSignedContract(args: {
  pdf: Buffer;
  candidateName: string;
  candidateEmail: string;
  hrRecipients: string[];
  from: string;
  folderId: string;
  dateYmd: string;
}): Promise<DeliveryResult> {
  const result: DeliveryResult = {};
  const filename = `Contract - ${args.candidateName} - ${args.dateYmd}.pdf`;

  if (args.folderId) {
    try {
      const drive = await driveClient();
      const created = await drive.files.create({
        requestBody: { name: filename, parents: [args.folderId] },
        media: { mimeType: "application/pdf", body: Readable.from(args.pdf) },
        fields: "id, webViewLink",
        supportsAllDrives: true,
      });
      result.pdfDriveFileId = created.data.id ?? undefined;
      result.pdfWebViewLink = created.data.webViewLink ?? undefined;
    } catch (err) {
      console.warn("deliverSignedContract: Drive upload failed:", err instanceof Error ? err.message : err);
    }
  }

  const recipients = [args.candidateEmail, ...args.hrRecipients].filter(Boolean);
  try {
    await sendSystemEmail({
      from: args.from,
      to: recipients,
      subject: "Your signed Pure Water VA contract",
      body: `Hi ${args.candidateName},\n\nThanks for signing. Your signed contract is attached for your records.\n\n— Pure Water Automations`,
      attachments: [{ filename, content: args.pdf, mimeType: "application/pdf" }],
    });
  } catch (err) {
    console.warn("deliverSignedContract: email failed:", err instanceof Error ? err.message : err);
  }

  return result;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/contract/store.ts
git commit -m "feat(contract): best-effort signed-PDF Drive archive + email"
```

---

## Task 7: Sign state + sign action

**Files:**
- Create: `src/lib/actions/contract.ts`
- Test: `tests/contract-sign.test.ts`

The action reuses the existing `markContractSigned(candidateId)` for provisioning. It validates the token, builds the PDF, delivers it, writes a `ContractSignature`, clears the token.

- [ ] **Step 1: Write the failing test (guard logic, pure)**

Create `tests/contract-sign.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSignable } from "../src/lib/actions/contract";

const base = { currentStage: "contract_sent", contractDeadline: new Date(Date.now() + 86400000), signedAt: null as Date | null };

test("assertSignable passes for an open, in-window contract", () => {
  assert.doesNotThrow(() => assertSignable(base));
});
test("assertSignable rejects a wrong stage", () => {
  assert.throws(() => assertSignable({ ...base, currentStage: "onboarding" }), /already|not/i);
});
test("assertSignable rejects an expired link", () => {
  assert.throws(() => assertSignable({ ...base, contractDeadline: new Date(Date.now() - 1000) }), /expired/i);
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `node --import tsx --test tests/contract-sign.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/actions/contract.ts`:
```ts
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { loadSettings } from "@/lib/settings";
import { renderContract, contractVarsForCandidate } from "@/lib/contract/template";
import { DEFAULT_CONTRACT_TEMPLATE_HTML } from "@/lib/contract/seed-template";
import { generateSignedPdf } from "@/lib/contract/pdf";
import { deliverSignedContract } from "@/lib/contract/store";
import { markContractSigned } from "@/lib/actions/recruitment";
import { logActivity } from "@/lib/activity";

type Signable = { currentStage: string; contractDeadline: Date | null; signedAt: Date | null };

/** Throws a friendly error if the contract can't be signed right now. */
export function assertSignable(c: Signable): void {
  if (c.signedAt || c.currentStage !== "contract_sent") {
    throw new Error("This contract has already been signed or is not awaiting signature.");
  }
  if (c.contractDeadline && c.contractDeadline.getTime() < Date.now()) {
    throw new Error("This signing link has expired. Please contact Pure Water Automations.");
  }
}

async function templateHtml(settings: Map<string, string>): Promise<string> {
  return settings.get("contract_template_html")?.trim() || DEFAULT_CONTRACT_TEMPLATE_HTML;
}

/** Public read for the sign page. Returns the rendered contract + display state. */
export async function getSignState(token: string) {
  const candidate = await db.candidate.findUnique({ where: { contractSignToken: token } });
  if (!candidate) return { ok: false as const, error: "This signing link is not valid." };

  const alreadySigned = candidate.currentStage !== "contract_sent" || !!candidate.signedAt;
  const expired = !!candidate.contractDeadline && candidate.contractDeadline.getTime() < Date.now();

  const settings = await loadSettings();
  const trainee = await db.compensationRole.findUnique({ where: { compRole: "TRAINEE" } });
  const vars = contractVarsForCandidate(candidate, trainee, settings, new Date());
  const html = renderContract(await templateHtml(settings), vars);

  return {
    ok: true as const,
    name: vars.name,
    company: vars.company,
    deadline: vars.deadline,
    contractHtml: html,
    alreadySigned,
    expired,
  };
}

export type SignInput = { signerName: string; signatureImage: string | null; agree: boolean };

/** Public signing action. Records the signature, delivers the PDF, provisions the VA. */
export async function signContract(token: string, input: SignInput, meta: { ip: string | null; userAgent: string | null }) {
  if (!input.agree) throw new Error("Please confirm you have read and agree to the contract.");
  if (!input.signerName?.trim()) throw new Error("Please type your full legal name.");

  const candidate = await db.candidate.findUnique({ where: { contractSignToken: token } });
  if (!candidate) throw new Error("This signing link is not valid.");
  assertSignable(candidate);

  const now = new Date();
  const settings = await loadSettings();
  const trainee = await db.compensationRole.findUnique({ where: { compRole: "TRAINEE" } });
  const vars = contractVarsForCandidate(candidate, trainee, settings, now);
  const html = renderContract(await templateHtml(settings), vars);
  const templateHash = createHash("sha256").update(html).digest("hex");

  const pdf = await generateSignedPdf({
    contentHtml: html,
    signerName: input.signerName.trim(),
    signatureImage: input.signatureImage,
    audit: { signedAt: now.toISOString(), signerIp: meta.ip, userAgent: meta.userAgent, templateHash, candidateId: candidate.candidateId },
  });

  const from = settings.get("system_email_from")?.trim() || settings.get("hr_manager_email")?.trim() || "okamotomiak@gmail.com";
  const hrRecipients = [settings.get("hr_manager_email"), settings.get("people_ops_email")]
    .map((v) => (v ?? "").trim()).filter(Boolean) as string[];
  const delivery = await deliverSignedContract({
    pdf, candidateName: vars.name, candidateEmail: candidate.email, hrRecipients, from,
    folderId: (settings.get("signed_contracts_folder_id") ?? "").trim(), dateYmd: vars.date,
  });

  await db.contractSignature.create({
    data: {
      candidateId: candidate.candidateId,
      signerName: input.signerName.trim(),
      signerEmail: candidate.email,
      signedAt: now,
      signerIp: meta.ip,
      userAgent: meta.userAgent,
      signatureImage: input.signatureImage,
      templateHash,
      pdfDriveFileId: delivery.pdfDriveFileId,
      pdfWebViewLink: delivery.pdfWebViewLink,
    },
  });

  // Provision the VA (reuses the existing flow; passes its contract_sent guard here).
  await markContractSigned(candidate.candidateId);

  // Consume the token so the link can't be reused.
  await db.candidate.update({ where: { candidateId: candidate.candidateId }, data: { contractSignToken: null } });

  await logActivity({ source: "recruitment", eventType: "contract_signed_in_app", severity: "success", summary: `${vars.name} signed their contract online` });

  return { ok: true as const };
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `node --import tsx --test tests/contract-sign.test.ts`
Expected: PASS (3 guard tests).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/contract.ts tests/contract-sign.test.ts
git commit -m "feat(contract): sign state + signing action with audit + provisioning"
```

---

## Task 8: `markContractSent` sends the link

**Files:**
- Modify: `src/lib/actions/recruitment.ts`

- [ ] **Step 1: Add a sign-link email helper**

In `src/lib/actions/recruitment.ts`, after `emailSkillsTrialInvite` (~line 533), add:
```ts
async function emailContractLink(
  candidate: { name: string | null; email: string },
  token: string,
  settings: Map<string, string>,
): Promise<void> {
  const link = `${appBaseUrl(settings)}/sign/${token}`;
  await sendSystemEmail({
    from: systemEmailFrom(settings),
    to: candidate.email,
    subject: "Your Pure Water VA contract is ready to sign",
    body: [
      `Hi ${firstName(candidate.name) || "there"},`,
      "",
      "Congratulations! Your contract is ready. Please review and sign it here:",
      "",
      link,
      "",
      "It only takes a minute — read it, type your name, sign, and submit.",
      "",
      "— Pure Water Automations",
    ].join("\n"),
  });
}
```

- [ ] **Step 2: Generate the token + send in `markContractSent`**

Replace the body of `markContractSent` (lines ~197–213) so it generates a token, stores it, and emails the link. The `db.candidate.update` data block gains `contractSignToken: randomUUID()` — capture it first:
```ts
  const now = new Date();
  const token = randomUUID();
  const updated = await db.candidate.update({
    where: { candidateId },
    data: {
      contractStatus: "sent",
      contractSentAt: now,
      contractDeadline: addDays(now, deadlineDays),
      currentStage: "contract_sent",
      contractSignToken: token,
    },
  });

  const settings = await loadSettings();
  await emailContractLink(updated, token, settings).catch((err) =>
    console.warn("markContractSent: link email failed:", err instanceof Error ? err.message : err),
  );

  await logActivity({
    source: "recruitment",
    eventType: "contract_sent",
    summary: `Contract link sent to ${candidateLabel(updated)}`,
  });

  return updated;
```
(`randomUUID`, `loadSettings`, `addDays`, `candidateLabel`, `firstName`, `appBaseUrl`, `systemEmailFrom` are already imported/defined in this file.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 4: Manual smoke (dev)**

Run: `npm run dev`, then in a second shell trigger send for a `tenhr_pass` candidate (or use the `/recruitment` "Send contract" button). Confirm the candidate row gets a `contractSignToken` (`npx prisma studio`) and the dev console logs an email attempt.
Expected: token set; no thrown error even if email is unconfigured.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions/recruitment.ts
git commit -m "feat(recruitment): markContractSent generates a token and emails the sign link"
```

---

## Task 9: Public signing page + API

**Files:**
- Create: `src/app/sign/[token]/page.tsx`
- Create: `src/app/sign/[token]/SignClient.tsx`
- Create: `src/app/api/sign/state/route.ts`
- Create: `src/app/api/sign/submit/route.ts`

- [ ] **Step 1: API — sign state**

Create `src/app/api/sign/state/route.ts`:
```ts
import { getSignState } from "@/lib/actions/contract";

// PUBLIC — must be on the Cloudflare Access bypass (alongside /apply, /sign).
export async function POST(request: Request): Promise<Response> {
  try {
    const { token } = (await request.json()) as { token?: string };
    if (!token) return Response.json({ ok: false, error: "Missing token" }, { status: 400 });
    const state = await getSignState(token);
    return Response.json(state);
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
```

- [ ] **Step 2: API — submit**

Create `src/app/api/sign/submit/route.ts`:
```ts
import { signContract } from "@/lib/actions/contract";

// PUBLIC — must be on the Cloudflare Access bypass.
export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      token?: string; signerName?: string; signatureImage?: string | null; agree?: boolean;
    };
    if (!body.token) return Response.json({ ok: false, error: "Missing token" }, { status: 400 });
    const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = request.headers.get("user-agent");
    const result = await signContract(
      body.token,
      { signerName: body.signerName ?? "", signatureImage: body.signatureImage ?? null, agree: !!body.agree },
      { ip, userAgent },
    );
    return Response.json(result);
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
```

- [ ] **Step 3: Page (thin server wrapper, mirrors /track)**

Create `src/app/sign/[token]/page.tsx`:
```tsx
import { SignClient } from "./SignClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "PWA — Sign your contract" };

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SignClient token={token} />;
}
```

- [ ] **Step 4: Client component**

Create `src/app/sign/[token]/SignClient.tsx`:
```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";

type State = {
  ok: true; name: string; company: string; deadline: string;
  contractHtml: string; alreadySigned: boolean; expired: boolean;
} | { ok: false; error: string };

async function post(path: string, body: Record<string, unknown>) {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false, error: "Bad response" }));
}

export function SignClient({ token }: { token: string }) {
  const [state, setState] = useState<State | null>(null);
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);

  useEffect(() => { post("/api/sign/state", { token }).then(setState); }, [token]);

  useEffect(() => {
    if (state?.ok && !state.alreadySigned && !state.expired && canvasRef.current && !padRef.current) {
      padRef.current = new SignaturePad(canvasRef.current, { penColor: "#0b3d63" });
    }
  }, [state]);

  const submit = useCallback(async () => {
    setBusy(true); setError(null);
    const signatureImage = padRef.current && !padRef.current.isEmpty() ? padRef.current.toDataURL("image/png") : null;
    const res = await post("/api/sign/submit", { token, signerName: name, signatureImage, agree });
    setBusy(false);
    if (res.ok) setDone(true); else setError(res.error || "Could not submit. Please try again.");
  }, [token, name, agree]);

  if (!state) return <Shell><p>Loading…</p></Shell>;
  if (!state.ok) return <Shell><h1>Link not valid</h1><p>{state.error}</p></Shell>;
  if (done || state.alreadySigned) return <Shell><h1>Thank you{state.ok ? `, ${state.name}` : ""} 🎉</h1><p>Your contract is signed. We'll be in touch about onboarding.</p></Shell>;
  if (state.expired) return <Shell><h1>This link has expired</h1><p>Please contact {state.company} to get a new signing link.</p></Shell>;

  return (
    <Shell>
      <h1>Your {state.company} contract</h1>
      <p style={{ color: "#666" }}>Please read, then sign at the bottom. Sign by {state.deadline}.</p>
      <div style={{ border: "1px solid #e3e3e3", borderRadius: 12, padding: 24, background: "#fff", maxHeight: 420, overflow: "auto" }}
           dangerouslySetInnerHTML={{ __html: state.contractHtml }} />
      <div style={{ marginTop: 24 }}>
        <label style={{ display: "block", fontWeight: 500, marginBottom: 6 }}>Type your full legal name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ccc" }} />
      </div>
      <div style={{ marginTop: 16 }}>
        <label style={{ display: "block", fontWeight: 500, marginBottom: 6 }}>Draw your signature (optional)</label>
        <canvas ref={canvasRef} width={500} height={140} style={{ border: "1px solid #ccc", borderRadius: 8, width: "100%", touchAction: "none", background: "#fff" }} />
        <button type="button" onClick={() => padRef.current?.clear()} style={{ marginTop: 6, fontSize: 13 }}>Clear</button>
      </div>
      <label style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>I have read and agree to this contract.</span>
      </label>
      {error && <p style={{ color: "#c0392b" }}>{error}</p>}
      <button type="button" disabled={busy || !name.trim() || !agree} onClick={submit}
        style={{ marginTop: 20, padding: "12px 24px", borderRadius: 8, border: "none", background: name.trim() && agree ? "#0b3d63" : "#9bb", color: "#fff", fontWeight: 500 }}>
        {busy ? "Submitting…" : "Sign & submit"}
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px", fontFamily: "system-ui, sans-serif" }}>{children}</div>;
}
```

- [ ] **Step 5: Build + typecheck**

Run: `npm run typecheck && npm run build`
Expected: exits 0; `/sign/[token]`, `/api/sign/state`, `/api/sign/submit` appear in the route table.

- [ ] **Step 6: Manual smoke**

Run `npm run dev`; open `/sign/<token>` for a real `contract_sent` candidate token. Read → type name → tick agree → submit. Confirm: a `ContractSignature` row exists, the candidate moved to `onboarding`, an `Onboarding` row was created, and the token is cleared (re-opening the link shows "already signed").

- [ ] **Step 7: Commit**

```bash
git add "src/app/sign" "src/app/api/sign"
git commit -m "feat(contract): public signing page + state/submit endpoints"
```

---

## Task 10: Admin template editor

**Files:**
- Modify: `prisma/seed.ts`
- Create: `src/app/api/admin/contract-template/route.ts`
- Create: `src/app/(app)/admin/contract/page.tsx`
- Create: `src/components/ContractTemplateEditor.tsx`
- Modify: `src/lib/actions/contract.ts` (add `saveContractTemplate`)

- [ ] **Step 1: Seed the defaults**

In `prisma/seed.ts`, near the other `upsert` blocks, add:
```ts
import { DEFAULT_CONTRACT_TEMPLATE_HTML } from "../src/lib/contract/seed-template";

const settingDefaults: [string, string][] = [
  ["contract_template_html", DEFAULT_CONTRACT_TEMPLATE_HTML],
  ["company_name", "Pure Water Automations"],
  ["contract_role_label", "Virtual Assistant"],
];
for (const [key, value] of settingDefaults) {
  await db.setting.upsert({ where: { key }, update: {}, create: { key, value } });
}
```
(`update: {}` means re-seeding never overwrites an edited template.)

- [ ] **Step 2: Add the save action**

In `src/lib/actions/contract.ts`, add:
```ts
export async function saveContractTemplate(html: string): Promise<{ ok: true }> {
  const value = (html ?? "").trim();
  if (!value) throw new Error("Template cannot be empty.");
  await db.setting.upsert({ where: { key: "contract_template_html" }, update: { value }, create: { key: "contract_template_html", value } });
  return { ok: true };
}
```

- [ ] **Step 3: Save endpoint (admin only)**

Create `src/app/api/admin/contract-template/route.ts`:
```ts
import { saveContractTemplate } from "@/lib/actions/contract";
import { action, str } from "@/lib/api";

export const POST = action(async ({ body }) => saveContractTemplate(str(body, "html")), {
  allow: () => false, // admins bypass; non-admins blocked
});
```

- [ ] **Step 4: Editor component**

Create `src/components/ContractTemplateEditor.tsx`:
```tsx
"use client";
import { useState } from "react";

export function ContractTemplateEditor({ initial }: { initial: string }) {
  const [html, setHtml] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  async function save() {
    setMsg("Saving…");
    const r = await fetch("/api/admin/contract-template", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ html }) });
    const j = await r.json().catch(() => ({ ok: false }));
    setMsg(j.ok ? "Saved." : `Error: ${j.error ?? "failed"}`);
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div>
        <textarea value={html} onChange={(e) => setHtml(e.target.value)} style={{ width: "100%", height: 420, fontFamily: "monospace", fontSize: 13 }} />
        <p className="small">Tokens: {"{{name}} {{role}} {{rate}} {{date}} {{deadline}} {{company}}"}</p>
        <button type="button" onClick={save}>Save template</button>
        {msg && <span style={{ marginLeft: 10 }}>{msg}</span>}
      </div>
      <div style={{ border: "1px solid #e3e3e3", borderRadius: 12, padding: 16, background: "#fff", overflow: "auto" }}
           dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
```

- [ ] **Step 5: Admin page**

Create `src/app/(app)/admin/contract/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { DEFAULT_CONTRACT_TEMPLATE_HTML } from "@/lib/contract/seed-template";
import { ContractTemplateEditor } from "@/components/ContractTemplateEditor";

export const dynamic = "force-dynamic";

export default async function ContractTemplatePage() {
  const user = await getCurrentUser();
  if (!user.isAdmin) redirect("/");
  const row = await db.setting.findUnique({ where: { key: "contract_template_html" } });
  return (
    <>
      <div className="page-head"><div><div className="crumb">Admin</div><h1>Contract template</h1></div></div>
      <ContractTemplateEditor initial={row?.value || DEFAULT_CONTRACT_TEMPLATE_HTML} />
    </>
  );
}
```

- [ ] **Step 6: Build + typecheck**

Run: `npm run typecheck && npm run build`
Expected: exits 0; `/admin/contract` in the route table.

- [ ] **Step 7: Commit**

```bash
git add prisma/seed.ts src/lib/actions/contract.ts "src/app/api/admin/contract-template" "src/app/(app)/admin/contract" src/components/ContractTemplateEditor.tsx
git commit -m "feat(contract): admin template editor + seeded defaults"
```

---

## Task 11: Onboarding completion advances stage + welcomes the VA

**Files:**
- Modify: `src/lib/actions/onboarding.ts`
- Test: `tests/onboarding-complete.test.ts`

- [ ] **Step 1: Write the failing test (pure welcome-body helper)**

Create `tests/onboarding-complete.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { welcomeEmailBody } from "../src/lib/actions/onboarding";

test("welcomeEmailBody greets the VA by first name", () => {
  const body = welcomeEmailBody("Ana Cruz", "Pure Water Automations");
  assert.match(body, /Hi Ana/);
  assert.match(body, /Pure Water Automations/);
});
```

- [ ] **Step 2: Run it; verify it fails**

Run: `node --import tsx --test tests/onboarding-complete.test.ts`
Expected: FAIL — `welcomeEmailBody` not exported.

- [ ] **Step 3: Implement**

In `src/lib/actions/onboarding.ts`, add imports at the top:
```ts
import { sendSystemEmail } from "@/lib/email";
import { loadSettings } from "@/lib/settings";
```
Add the exported helper:
```ts
export function welcomeEmailBody(vaName: string, company: string): string {
  const first = vaName.trim().split(/\s+/)[0] || "there";
  return [
    `Hi ${first},`,
    "",
    `Welcome to ${company}! Your onboarding checklist is complete and your account is set up.`,
    "",
    "You can sign in to your VA console to see your tasks, log your monthly check-in, and track your tier progress.",
    "",
    `— ${company}`,
  ].join("\n");
}
```
Replace `markComplete` with:
```ts
export async function markComplete(vaId: string) {
  const row = await db.onboarding.findUnique({ where: { vaId } });
  if (!row) throw new Error(`No onboarding record for ${vaId}`);

  const updated = await db.onboarding.update({ where: { vaId }, data: { status: "completed" } });

  // Advance the linked candidate off the dead-end onboarding stage.
  const candidate = await db.candidate.findFirst({ where: { vaId, currentStage: "onboarding" } });
  if (candidate) {
    await db.candidate.update({ where: { candidateId: candidate.candidateId }, data: { currentStage: "closed" } });
  }

  // Welcome the new VA (best-effort).
  const va = await db.va.findUnique({ where: { vaId } });
  if (va?.email) {
    const settings = await loadSettings();
    const company = settings.get("company_name")?.trim() || "Pure Water Automations";
    const from = settings.get("system_email_from")?.trim() || settings.get("hr_manager_email")?.trim() || "okamotomiak@gmail.com";
    await sendSystemEmail({ from, to: va.email, subject: `Welcome to ${company}!`, body: welcomeEmailBody(va.name, company) })
      .catch((err) => console.warn("markComplete: welcome email failed:", err instanceof Error ? err.message : err));
  }

  await logActivity({
    source: "hr_action",
    eventType: "onboarding_complete",
    severity: "success",
    vaId,
    summary: `${updated.vaName ?? vaId} onboarding complete — VA welcomed, pipeline closed`,
  });

  return updated;
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `node --import tsx --test tests/onboarding-complete.test.ts`
Expected: PASS.

- [ ] **Step 5: Full test suite + typecheck**

Run: `npm test && npm run typecheck`
Expected: all tests pass (existing 22 + new), typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/actions/onboarding.ts tests/onboarding-complete.test.ts
git commit -m "feat(onboarding): completing onboarding closes pipeline + welcomes the VA"
```

---

## Task 12: Nav link + deploy/config (no code)

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Add the admin nav link (optional convenience)**

In `src/components/Sidebar.tsx`, in the HR `Manage` section `items` array, add:
```ts
        { href: "/admin/contract", label: "Contract template" },
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Cloudflare Access bypass (deploy step — run on the VPS/CF side)**

Add `/sign/*` and `/api/sign/*` to the Cloudflare Access **bypass** policy for `team.pwasecondbrain.uk`, alongside the existing `/apply` bypass (Zero Trust → Access → Applications → the team app → policies, or via the API). Without this, candidates hit the Google login wall and can't sign.

Verify after deploy: open `https://team.pwasecondbrain.uk/sign/<token>` in an incognito window (no login) — the page must load.

- [ ] **Step 4: Migrate + seed on the VPS**

After `./deploy.sh` (which runs `prisma migrate deploy` + build), seed the new settings once:
```bash
ssh root@74.208.40.108 "cd /app/SecondBrain/va-management-console/current && set -a && . ../shared/.env.production && set +a && npm run prisma:seed"
```
Optionally set `signed_contracts_folder_id` (a Drive folder shared with the service account `streamlitjustin@…`) in the `Setting` table or the admin UI to enable the Drive archive.

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "chore(contract): add admin nav link for the contract template"
```

---

## Self-review (completed during planning)

**Spec coverage**
- Send-contract emails the link → Task 8. ✓
- Public tokenized sign page → Task 9. ✓
- Audit trail (name/IP/UA/timestamp/template hash/signature image) → Task 7 (`signContract`) + Task 3 schema. ✓
- Signed PDF → Task 5; Drive + email delivery → Task 6. ✓
- Reuse existing provisioning → Task 7 calls `markContractSigned`. ✓
- Token guards (invalid/expired/used/wrong-stage) → Task 7 `assertSignable` + `getSignState`. ✓
- HTML-subset template + merge fields → Task 4. ✓
- Email attachment prerequisite → Task 2. ✓
- Admin editor + seeded defaults → Task 10. ✓
- Onboarding dead-end fix → Task 11. ✓
- Deps, CF Access bypass, migrate/seed → Tasks 1 & 12. ✓
- HR fallback "Mark signed" stays unchanged (no task touches `markContractSigned`'s signature). ✓

**Placeholder scan:** no TBD/TODO; every code step has complete code. The two execution-time confirmations (react-pdf `renderToBuffer` export name; CF Access bypass) are explicit verification steps, not placeholders.

**Type consistency:** `generateSignedPdf(SignedPdfInput)` shape matches its caller in Task 7; `ContractVars`/`renderContract`/`contractVarsForCandidate` signatures consistent across Tasks 4 and 7; `deliverSignedContract` args object matches its Task 7 caller; `assertSignable(Signable)` matches its test and caller. `buildMimeMessage` (Task 2) replaces `buildRawMessage` at its single call site.

**Scope:** single feature, two deliverables, one implementation cycle. No decomposition needed.
