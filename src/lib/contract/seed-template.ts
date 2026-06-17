// The default contract shown in the e-signer. Faithfully reproduces Pure Water
// Automations' "Independent Contractor Agreement" + "Non-Disclosure Agreement"
// (HR DOCS/TEMPLATE in Drive). Merge tokens: {{name}} {{role}} {{rate}} {{date}}
// {{deadline}} {{company}}. Fields the app doesn't collect are left as blank
// fill-lines (____). Editable from /admin/contract — edits override this default.
export const DEFAULT_CONTRACT_TEMPLATE_HTML = `
<h1>Independent Contractor Agreement</h1>
<p>This Independent Contractor Agreement (the "Agreement") is made and entered into as of {{date}} (the "Effective Date"),</p>
<p><strong>BETWEEN:</strong> {{company}} (the "Company"), a business with its principal place of operations at 689 Cottage Ln, Valley Cottage, NY 10989,</p>
<p><strong>AND:</strong> {{name}} (the "Contractor"), an individual with an address at ____________________.</p>
<p>The Company and the Contractor are individually referred to as a "Party" and collectively as the "Parties."</p>
<p>This offer must be signed by {{deadline}}.</p>

<h2>Recitals</h2>
<p><strong>WHEREAS,</strong> the Company is engaged in the business of providing virtual assistant and automation services to various clients;</p>
<p><strong>WHEREAS,</strong> the Contractor possesses the qualifications, experience, and ability to perform such services;</p>
<p><strong>NOW, THEREFORE,</strong> in consideration of the mutual covenants and promises contained herein, the Parties agree as follows:</p>

<h2>Article 1: Engagement and Services</h2>
<h3>1.1. Engagement</h3>
<p>The Company hereby engages the Contractor, and the Contractor agrees to be engaged, as an Independent Virtual Assistant Contractor under the Pure Water Assistants Team, on a non-exclusive, independent contractor basis.</p>
<h3>1.2. Nature of Work</h3>
<p>The Contractor shall perform assigned professional services remotely and shall deliver all tasks in accordance with Company standards and client requirements.</p>
<h3>1.3. Core Duties</h3>
<p>The Contractor will be responsible for the following core duties (including but not limited to):</p>
<ul>
<li>Email and inbox management</li>
<li>Calendar and appointment scheduling</li>
<li>Social media posting and engagement</li>
<li>File organization and cloud storage management</li>
<li>Research and online task execution</li>
<li>Communication and coordination with clients and team members</li>
<li>Data Management: Maintaining, cleaning, and organizing datasets in spreadsheets, dashboards, and client databases</li>
<li>System Development: Building and optimizing automation workflows within Google Workspace, AppSheet, or similar platforms</li>
<li>AI Scripting: Creating and refining automation scripts or AI prompts to enhance efficiency and reduce manual workload</li>
</ul>
<p>The Contractor's specific scope of work may evolve depending on client needs.</p>
<h3>1.4. Work Environment</h3>
<p>This is a 100% remote position. The Contractor is not expected or permitted to perform in-person tasks or errands.</p>

<h2>Article 2: Compensation</h2>
<h3>2.1. Hourly Rate</h3>
<p>The Contractor shall be compensated at a rate of {{rate}}, based on verified hours worked and recorded through Company-approved time-tracking software.</p>
<h3>2.2. Payment Schedule</h3>
<p>Payments will be issued twice monthly, according to the following schedule:</p>
<ul>
<li>On the 15th of each month for work performed from the 1st-14th, and</li>
<li>On the 30th (or last day) of each month for work performed from the 15th-end of the month.</li>
</ul>
<p>Payments shall be made via the Contractor's selected payment platform: [ ] Wise  [ ] Payoneer</p>
<h3>2.3. Bonuses</h3>
<p>The Contractor may be eligible for the following bonuses, subject to Company approval:</p>
<ul>
<li>Specialization Bonus: Additional $____/hr for each verified specialty</li>
<li>Performance Bonus: Based on client feedback and task completion quality</li>
<li>Retention Bonus: Awarded for continuous engagement milestones</li>
</ul>

<h2>Article 3: Tools, Reporting, and Schedule</h2>
<h3>3.1. Work Hours and Weekly Limit</h3>
<p>The Contractor's weekly working hours shall not exceed ______ hours per week, unless prior written approval is granted by the Company. Any hours worked beyond the approved weekly limit without authorization will not be billable and may be subject to deduction or review.</p>
<h3>3.2. Time Tracking</h3>
<p>The Contractor must use Desklog or other Company-approved time-tracking tools to log all active work hours. Recorded time will serve as the sole basis for payment.</p>
<h3>3.3. Reporting</h3>
<p>The Contractor shall submit a daily Loom report or equivalent summary, as requested, to maintain transparency and ensure project progress.</p>

<h2>Article 4: Tax and Licensing Responsibilities</h2>
<h3>4.1. Independent Tax Responsibility</h3>
<p>All payments made under this Agreement are gross and do not include tax withholdings. The Contractor is solely responsible for filing and paying all applicable local, state, and national taxes, including but not limited to income tax, self-employment tax, or any other taxes imposed by law.</p>
<h3>4.2. Licensing and Compliance</h3>
<p>The Contractor is responsible for obtaining and maintaining all licenses, business registrations, or permits required by their local government or jurisdiction to operate as an independent contractor. The Contractor affirms that they are operating as an independent entity and are not an employee of the Company.</p>
<h3>4.3. Liability</h3>
<p>By signing this Agreement, the Contractor acknowledges that they understand and will comply with their local government's tax and licensing requirements, and that Pure Water Automations shall not be held responsible or liable for any tax, licensing, or legal issues that arise from the Contractor's operations.</p>

<h2>Article 5: Term and Termination</h2>
<h3>5.1. Term</h3>
<p>This Agreement shall commence on the Effective Date and continue unless terminated in accordance with this Article.</p>
<h3>5.2. Termination by Notice</h3>
<p>Either Party may terminate this Agreement by providing one (1) month's written notice to the other.</p>
<h3>5.3. Immediate Termination</h3>
<p>The Company may terminate this Agreement immediately in the event of gross misconduct, breach of confidentiality, failure to perform duties, or violation of Company policies.</p>

<h2>Article 6: Restrictive Covenants</h2>
<h3>6.1. Confidentiality</h3>
<p>The Contractor agrees to maintain strict confidentiality regarding any Company or client information. This obligation survives termination of this Agreement.</p>
<h3>6.2. Non-Compete</h3>
<p>During the engagement and for two (2) years after termination, the Contractor shall not provide services that directly compete with Pure Water Assistants within any digital marketplace or region in which the Company operates.</p>
<h3>6.3. Non-Solicitation</h3>
<p>The Contractor shall not solicit any clients, team members, or affiliates of the Company for employment or business engagement with a competing entity during the term and for two (2) years after termination.</p>

<h2>Article 7: Independent Contractor Status</h2>
<h3>7.1. Relationship</h3>
<p>The Contractor is and shall remain an independent contractor. Nothing in this Agreement shall be construed to create an employer-employee relationship, partnership, or joint venture.</p>
<h3>7.2. Control</h3>
<p>The Contractor shall determine their own methods and processes for completing assignments, provided deadlines and quality standards are met.</p>
<h3>7.3. Equipment</h3>
<p>The Contractor shall use their own equipment, internet connection, and workspace to perform assigned services.</p>

<h2>Article 8: Governing Law and General Provisions</h2>
<h3>8.1. Governing Law</h3>
<p>This Agreement shall be governed by and construed in accordance with the laws of the State of New York, USA.</p>
<h3>8.2. Entire Agreement</h3>
<p>This Agreement represents the entire understanding between the Parties and supersedes all prior agreements or communications.</p>
<h3>8.3. Amendments</h3>
<p>Any modification must be made in writing and signed by both Parties.</p>

<p><strong>IN WITNESS WHEREOF, the Parties have executed this Independent Contractor Agreement as of the Effective Date.</strong></p>
<p><strong>THE COMPANY - Pure Water Automations</strong></p>
<p>By: ____________________</p>
<p>Name: Justin Okamoto</p>
<p>Title: CEO</p>
<p>Date: ____________________</p>
<p><strong>THE CONTRACTOR</strong></p>
<p>Printed Name: {{name}}</p>
<p>Date: {{date}}</p>
<p>(Signature captured electronically below.)</p>

<hr/>

<h1>Non-Disclosure Agreement (NDA)</h1>
<p>This Non-Disclosure Agreement ("Agreement") is entered into as of {{date}} by and between:</p>
<p><strong>Pure Water Automations</strong>, located at 689 Cottage Ln, Valley Cottage, NY 10989 ("Disclosing Party"),</p>
<p>and {{name}}, located at ____________________ ("Receiving Party").</p>
<p><strong>WHEREAS,</strong> the Disclosing Party intends to disclose certain confidential and proprietary information ("Confidential Information") to the Receiving Party for the purpose of performing duties related to engagement with Pure Water Automations under the position of {{role}} ("Purpose");</p>
<p><strong>NOW, THEREFORE,</strong> in consideration of the mutual promises and covenants contained herein, the parties agree as follows:</p>
<h3>1. Definition of Confidential Information</h3>
<p>For purposes of this Agreement, "Confidential Information" includes, but is not limited to, the following:</p>
<ul>
<li>Business strategies, operations, and marketing plans related to Pure Water Automations and its services.</li>
<li>Client lists, contracts, and information pertaining to services provided by Pure Water Assistants.</li>
<li>Any other proprietary information that is disclosed to the Receiving Party during the course of engagement, which may include operational procedures, financial data, and internal communications.</li>
</ul>
<p>Confidential Information does not include information that:</p>
<ul>
<li>Is already in the public domain at the time of disclosure or becomes publicly available without breach of this Agreement.</li>
<li>Is lawfully received from a third party without breach of any confidentiality obligation.</li>
<li>Is independently developed by the Receiving Party without reference to or reliance upon the Confidential Information.</li>
</ul>
<h3>2. Obligations of the Receiving Party</h3>
<p>The Receiving Party agrees to:</p>
<ul>
<li>Maintain the confidentiality of all Confidential Information and take all reasonable precautions to prevent unauthorized access, disclosure, or use of such information.</li>
<li>Use the Confidential Information solely for the Purpose and for no other purpose.</li>
<li>Not disclose any Confidential Information to any third party without prior written consent from the Disclosing Party.</li>
<li>Return all Confidential Information upon termination of engagement or at the request of the Disclosing Party.</li>
</ul>
<h3>3. Duration of Confidentiality</h3>
<p>The confidentiality obligations under this Agreement will continue indefinitely, regardless of whether the Receiving Party remains engaged by Pure Water Automations. The Receiving Party agrees to maintain confidentiality during and after their engagement.</p>
<h3>4. Exclusion from Confidential Information</h3>
<p>This Agreement does not apply to information that:</p>
<ul>
<li>Is publicly available without breach of this Agreement.</li>
<li>Is disclosed to the Receiving Party by a third party who is not subject to confidentiality obligations.</li>
<li>Is required to be disclosed by law, court order, or governmental authority, provided that the Receiving Party gives the Disclosing Party prompt notice of such requirement to allow the Disclosing Party the opportunity to seek protective relief.</li>
</ul>
<h3>5. Return of Confidential Information</h3>
<p>Upon termination of engagement or upon request by Pure Water Automations, the Receiving Party shall immediately return or destroy all Confidential Information, including copies or materials containing such information, in any form.</p>
<h3>6. No License</h3>
<p>Nothing in this Agreement grants the Receiving Party any right, title, or interest in or to the Confidential Information, nor does it grant any rights to use the Confidential Information except as expressly authorized herein.</p>
<h3>7. Indemnification</h3>
<p>The Receiving Party agrees to indemnify and hold harmless Pure Water Automations from any damages, losses, or expenses incurred as a result of the Receiving Party's breach of this Agreement.</p>
<h3>8. Governing Law</h3>
<p>This Agreement shall be governed by and construed in accordance with the laws of the State of New York, USA, without regard to its conflicts of law principles.</p>
<h3>9. Entire Agreement</h3>
<p>This Agreement constitutes the entire agreement between the parties concerning the subject matter hereof and supersedes all prior agreements or understandings, whether written or oral, relating to such subject matter.</p>
<h3>10. Severability</h3>
<p>If any provision of this Agreement is found to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.</p>
<h3>11. Acknowledgment</h3>
<p>The Receiving Party acknowledges that they have read and understand the terms of this Non-Disclosure Agreement and agree to abide by the confidentiality obligations set forth herein.</p>
<p><strong>Disclosing Party:</strong> Pure Water Automations - Name: Justin Okamoto, Title: CEO</p>
<p><strong>Receiving Party:</strong> Printed Name: {{name}}, Date: {{date}} (Signature captured electronically below.)</p>
<p>By signing below, the Contractor confirms they have read and agree to both the Independent Contractor Agreement and this Non-Disclosure Agreement.</p>
`.trim();
