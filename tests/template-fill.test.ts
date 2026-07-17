import test from "node:test";
import assert from "node:assert/strict";

import { fillTemplateBody } from "../src/components/sales/TemplatesClient";

test("fillTemplateBody replaces filled placeholders", () => {
  assert.equal(
    fillTemplateBody("Hi [name], your call is on [date].", { name: "Alex", date: "Friday" }),
    "Hi Alex, your call is on Friday.",
  );
});

test("fillTemplateBody keeps blank placeholders", () => {
  assert.equal(
    fillTemplateBody("Hi [name] — [name], please reply to [email].", { name: "", email: "   " }),
    "Hi [name] — [name], please reply to [email].",
  );
});
