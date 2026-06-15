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
