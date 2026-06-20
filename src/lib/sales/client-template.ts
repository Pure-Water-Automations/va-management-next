import type { Deal, ClientAgreement } from "@prisma/client";

export type AgreementVars = {
  client: string;
  contact: string;
  package: string;
  price: string;
  billing: string;
  start_date: string;
  date: string;
  deadline: string;
  company: string;
};

const TOKENS: (keyof AgreementVars)[] = [
  "client",
  "contact",
  "package",
  "price",
  "billing",
  "start_date",
  "date",
  "deadline",
  "company",
];

/** Replace {{token}} with the matching var; unknown tokens render empty. */
export function renderAgreement(templateHtml: string, vars: AgreementVars): string {
  return templateHtml.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (_m, key: string) =>
    TOKENS.includes(key as keyof AgreementVars) ? vars[key as keyof AgreementVars] ?? "" : "",
  );
}

function ymd(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

/** Build the merge vars for a client agreement at render/sign time. */
export function agreementVarsForDeal(
  deal: Pick<Deal, "orgName" | "contactName" | "packageName" | "billingType" | "startDate">,
  agreement: Pick<ClientAgreement, "packageName" | "priceLabel" | "billingType" | "deadline">,
  settings: Map<string, string>,
  now: Date,
): AgreementVars {
  return {
    client: deal.orgName?.trim() || "Client",
    contact: deal.contactName?.trim() || "",
    package: agreement.packageName?.trim() || deal.packageName?.trim() || "",
    price: agreement.priceLabel?.trim() || "",
    billing: agreement.billingType?.trim() || deal.billingType?.trim() || "",
    start_date: ymd(deal.startDate),
    date: ymd(now),
    deadline: ymd(agreement.deadline),
    company: settings.get("company_name")?.trim() || "Pure Water Automations",
  };
}

// Default client Service Agreement. Reproduces the contract key terms from the
// "Onboard clients" SOP (monthly billed in advance, 30-day notice, unused hours
// non-refundable, deliverable ownership, confidentiality, NY law). Editable under
// /admin/client-agreement. Tokens: {{client}} {{contact}} {{package}} {{price}}
// {{billing}} {{start_date}} {{date}} {{deadline}} {{company}}.
export const DEFAULT_CLIENT_AGREEMENT_TEMPLATE_HTML = `
<h1>Services Agreement</h1>
<p>This Services Agreement (the "Agreement") is made and entered into as of {{date}} (the "Effective Date"),</p>
<p><strong>BETWEEN:</strong> {{company}} (the "Company"), a business with its principal place of operations at 689 Cottage Ln, Valley Cottage, NY 10989,</p>
<p><strong>AND:</strong> {{client}} (the "Client"){{contact}}.</p>
<p>This offer is valid until {{deadline}}.</p>

<h2>1. Services</h2>
<p>The Company will provide the Client with the <strong>{{package}}</strong> package of virtual assistant, administrative, and automation support services, beginning on {{start_date}}. The specific scope, deliverables, and weekly priorities will be confirmed during onboarding and may evolve by mutual agreement.</p>

<h2>2. Fees and Billing</h2>
<p>Fees for the services are <strong>{{price}}</strong> ({{billing}}).</p>
<ul>
<li>Retainer / monthly packages are billed in advance.</li>
<li>No services begin until this Agreement is signed and the first payment (or saved payment authorization, for hourly packages) is received.</li>
<li>Unused hours within a billing period are non-refundable and do not roll over unless otherwise agreed in writing.</li>
</ul>

<h2>3. Term and Cancellation</h2>
<p>This Agreement begins on the Effective Date and continues on a rolling basis until terminated. Either Party may cancel by providing thirty (30) days' written notice. Fees for the notice period remain payable.</p>

<h2>4. Ownership of Deliverables</h2>
<p>Upon full payment, the Client owns all final deliverables produced specifically for the Client under this Agreement. The Company retains ownership of its own pre-existing tools, templates, and general know-how.</p>

<h2>5. Confidentiality</h2>
<p>Each Party agrees to keep the other's confidential information private and to use it solely to perform this Agreement. The Company will treat all Client materials, systems access, and data as confidential. This obligation survives termination.</p>

<h2>6. Independent Contractor</h2>
<p>The Company provides services as an independent contractor. Nothing in this Agreement creates an employment, partnership, or joint-venture relationship between the Parties.</p>

<h2>7. Limitation of Liability</h2>
<p>The Company will perform the services with reasonable skill and care. To the extent permitted by law, the Company's total liability under this Agreement is limited to the fees paid by the Client in the one (1) month preceding the event giving rise to the claim.</p>

<h2>8. Governing Law</h2>
<p>This Agreement is governed by and construed in accordance with the laws of the State of New York, USA, without regard to its conflict-of-law principles.</p>

<h2>9. Entire Agreement</h2>
<p>This Agreement is the entire understanding between the Parties and supersedes all prior discussions. Any amendment must be in writing and agreed by both Parties.</p>

<p><strong>IN WITNESS WHEREOF, the Parties agree to the terms above as of the Effective Date.</strong></p>
<p><strong>THE COMPANY — {{company}}</strong></p>
<p>By: ____________________ &nbsp; Name: Justin Okamoto &nbsp; Title: CEO</p>
<p><strong>THE CLIENT — {{client}}</strong></p>
<p>Printed Name: {{contact}} &nbsp; Date: {{date}}</p>
<p>(Signature captured electronically below.)</p>
`.trim();
