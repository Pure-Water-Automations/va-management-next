/**
 * Native VA job-application questionnaire — a Typeform-style, one-question-at-a-time
 * intake that replaces the Google Form. Grounded in the REAL Pure Water application
 * (the "Form Responses 1" sheet): identity, faith-community affiliation, experience,
 * resume, skills, availability, and a work-readiness battery.
 *
 * Pure data — imported by both the public form UI and the server-side validator so
 * the two never drift.
 */

export type QuestionType =
  | "email"
  | "short_text"
  | "long_text"
  | "url"
  | "yes_no"
  | "single_select"
  | "multi_select"
  | "dropdown";

export type ApplicationQuestion = {
  key: string;
  label: string;
  help?: string;
  helpLink?: { label: string; url: string }; // a clickable helper link under the help text
  image?: string; // an illustrative image shown above the input (e.g. a time-zone map)
  type: QuestionType;
  required: boolean;
  placeholder?: string;
  options?: string[]; // single_select / multi_select / dropdown
  allowOther?: boolean; // multi_select: offer an "Other" free-text choice
  /** Branching: only show this question when another answer equals a value. */
  showIf?: { key: string; equals: string };
};

/** Default skill checklist (overridable at runtime by the `skill_list` setting). */
export const DEFAULT_SKILL_OPTIONS = [
  "Bookkeeping", "Comms", "Content", "Design", "Onboarding", "Project Management",
  "Research", "Scheduling", "Social Media", "Team Management", "Tech/Automation", "Video Editing",
];

/** UTC-offset choices with anchor regions, for the time-zone dropdown. */
export const TIMEZONE_OPTIONS = [
  "UTC-12", "UTC-11 (American Samoa)", "UTC-10 (Hawaii)", "UTC-9 (Alaska)",
  "UTC-8 (Los Angeles, Vancouver)", "UTC-7 (Denver)", "UTC-6 (Mexico City, Chicago)",
  "UTC-5 (New York, Bogotá)", "UTC-4 (Santiago, Caracas)", "UTC-3 (São Paulo, Buenos Aires)",
  "UTC-2", "UTC-1 (Azores)", "UTC+0 (London, Accra)", "UTC+1 (Berlin, Lagos)",
  "UTC+2 (Cairo, Johannesburg)", "UTC+3 (Nairobi, Moscow)", "UTC+4 (Dubai)", "UTC+5 (Karachi)",
  "UTC+5:30 (India, Sri Lanka)", "UTC+6 (Dhaka)", "UTC+7 (Bangkok, Jakarta)",
  "UTC+8 (Manila, Singapore, China)", "UTC+9 (Tokyo, Seoul)", "UTC+10 (Sydney)",
  "UTC+11", "UTC+12 (Auckland)",
];

export const APPLICATION_QUESTIONS: readonly ApplicationQuestion[] = [
  { key: "email", label: "What's your email address?", type: "email", required: true, placeholder: "name@example.com", help: "We'll use this to follow up about your application." },
  { key: "firstName", label: "What's your first name?", type: "short_text", required: true, placeholder: "First name" },
  { key: "lastName", label: "And your last name?", type: "short_text", required: true, placeholder: "Last name" },
  { key: "address", label: "Where are you located?", type: "short_text", required: true, placeholder: "City, province / state, country" },
  { key: "community", label: "What community or church are you affiliated with?", type: "short_text", required: true, placeholder: "Community or church name" },
  { key: "pastor", label: "Who is your community pastor?", type: "short_text", required: false, placeholder: "Pastor's name (if applicable)" },
  { key: "hasVaExperience", label: "Have you worked as a Virtual Assistant before?", type: "yes_no", required: true },
  { key: "vaExperienceDesc", label: "Tell us about your VA experience.", help: "Types of tasks, the industries you supported, tools you used.", type: "long_text", required: true, showIf: { key: "hasVaExperience", equals: "yes" } },
  { key: "adminExperienceDesc", label: "Tell us about your other administrative experience.", help: "E.g. office assistant, secretary, project coordinator.", type: "long_text", required: true, showIf: { key: "hasVaExperience", equals: "no" } },
  { key: "resumeUrl", label: "Share a link to your current resume.", help: "Upload your PDF or Word resume to Google Drive / Dropbox and paste a shareable link. Make sure link-sharing is on.", type: "url", required: true, placeholder: "https://drive.google.com/…" },
  { key: "skills", label: "What skills do you have that would help in a VA role?", help: "Pick all that apply — and add your own under \"Other\".", type: "multi_select", allowOther: true, required: true, options: DEFAULT_SKILL_OPTIONS },
  { key: "timezone", label: "What time zone are you in?", help: "Find the city nearest you on the map, then pick your UTC offset.", image: "/timezones.svg", type: "dropdown", options: TIMEZONE_OPTIONS, required: true },
  { key: "availability", label: "What hours can you work?", help: "When are you available? Mention your timezone or the client's.", type: "short_text", required: true, placeholder: "e.g. 9am–6pm Manila time, flexible evenings US Eastern" },
  { key: "comfortableUsClients", label: "Are you comfortable working with U.S.-based clients and adjusting your schedule if needed?", type: "yes_no", required: true },
  { key: "hasComputer", label: "Do you have a personal laptop or desktop available for work?", type: "yes_no", required: true },
  { key: "internetType", label: "What type of internet connection do you use?", type: "short_text", required: true, placeholder: "e.g. Fiber, DSL, mobile data" },
  { key: "internetSpeed", label: "What's your average internet speed?", help: "Not sure? Run a quick free speed test and paste your download speed (e.g. 50 Mbps).", helpLink: { label: "Run a free speed test →", url: "https://www.speedtest.net" }, type: "short_text", required: true, placeholder: "e.g. 50 Mbps" },
  { key: "quietWorkspace", label: "Do you have a quiet workspace suitable for calls and focused work?", type: "yes_no", required: true },
  { key: "headsetMic", label: "Do you have a working headset and microphone for meetings?", type: "yes_no", required: true },
  { key: "backupOption", label: "If the power or internet goes out, do you have a backup option?", help: "Tell us what you'd do — backup internet, a co-working space, a generator, etc.", type: "short_text", required: true },
];

/** Is a question visible given the current answers (respects showIf branching)? */
export function isVisible(q: ApplicationQuestion, answers: Record<string, unknown>): boolean {
  if (!q.showIf) return true;
  return String(answers[q.showIf.key] ?? "") === q.showIf.equals;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ApplicationValidation = { ok: true; answers: Record<string, string> } | { ok: false; error: string };

/** Validate a submitted answer set against the visible, required questions. */
export function validateApplication(raw: Record<string, unknown>): ApplicationValidation {
  const answers: Record<string, string> = {};
  for (const q of APPLICATION_QUESTIONS) {
    if (!isVisible(q, raw)) continue;
    const value = typeof raw[q.key] === "string" ? (raw[q.key] as string).trim() : "";
    if (!value) {
      if (q.required) return { ok: false, error: `Please answer: ${q.label}` };
      continue;
    }
    if (q.type === "email" && !EMAIL_RE.test(value)) return { ok: false, error: "Please enter a valid email address." };
    if (q.type === "url" && !/^https?:\/\//i.test(value)) return { ok: false, error: "Please paste a full link starting with http(s)://" };
    if (q.type === "yes_no" && !["yes", "no"].includes(value.toLowerCase())) return { ok: false, error: `Please answer yes or no: ${q.label}` };
    answers[q.key] = value;
  }
  return { ok: true, answers };
}

/** Map validated answers to the Candidate columns we store structurally. */
export function candidateFieldsFromAnswers(answers: Record<string, string>) {
  const name = [answers.firstName, answers.lastName].filter(Boolean).join(" ").trim() || null;
  return {
    name,
    email: (answers.email || "").toLowerCase(),
    skillsRoleTags: answers.skills || null,
    resumeUrl: answers.resumeUrl || null,
    country: answers.address || null,
  };
}
