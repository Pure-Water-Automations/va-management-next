export interface SanitizedModelText {
  clean: string;
  flags: string[];
}

const PII_RULES: Array<{ flag: string; pattern: RegExp; replacement: string }> = [
  {
    flag: "redacted-email",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[redacted-email]",
  },
  {
    flag: "redacted-ssn",
    pattern: /\b\d{3}[- ]\d{2}[- ]\d{4}\b/g,
    replacement: "[redacted-ssn]",
  },
  {
    flag: "redacted-credit-card",
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    replacement: "[redacted-credit-card]",
  },
  {
    flag: "redacted-phone",
    // Require at least one separator so a bare digit run (e.g. an account number)
    // falls through to redacted-long-number; the leading "(" is consumed whole.
    pattern: /\(?\+?\d{2,4}[).\s-]+\d{2,4}[.\s-]?\d{2,4}(?:[.\s-]?\d{2,4})?/g,
    replacement: "[redacted-phone]",
  },
  {
    flag: "redacted-long-number",
    pattern: /\b\d{7,}\b/g,
    replacement: "[redacted-long-number]",
  },
];

const INJECTION_RULES: Array<{ flag: string; pattern: RegExp }> = [
  { flag: "prompt-injection:ignore-instructions", pattern: /\bignore\s+(?:all\s+)?(?:previous|prior)\s+instructions\b/i },
  { flag: "prompt-injection:reveal-secrets", pattern: /\breveal\s+the\s+(?:hidden\s+)?(?:targets|system\s+prompt|rubric)\b/i },
  { flag: "prompt-injection:role-switch", pattern: /\byou\s+are\s+now\b/i },
  { flag: "prompt-injection:disregard", pattern: /\bdisregard\b/i },
  { flag: "prompt-injection:role-marker", pattern: /(?:^|\s)(?:system|assistant|user)\s*:/i },
  { flag: "prompt-injection:role-marker", pattern: /(?:\[|<\|)\s*(?:system|assistant|user)\s*(?:\]|\|>)/i },
];

/** Prepare untrusted candidate text for a model prompt without changing stored text. */
export function sanitizeForModel(text: string): SanitizedModelText {
  const flags: string[] = [];
  let clean = text;

  for (const rule of PII_RULES) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(clean)) {
      flags.push(rule.flag);
      rule.pattern.lastIndex = 0;
      clean = clean.replace(rule.pattern, rule.replacement);
    }
  }

  clean = clean
    .split(/\r?\n/)
    .map((line) => {
      const caught = INJECTION_RULES.filter((rule) => rule.pattern.test(line));
      if (caught.length === 0) return line;
      for (const rule of caught) {
        if (!flags.includes(rule.flag)) flags.push(rule.flag);
      }
      return "[redacted-prompt-injection]";
    })
    .join("\n");

  return { clean, flags };
}
