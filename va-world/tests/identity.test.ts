import { test } from "node:test";
import assert from "node:assert/strict";
import { guestNameFromEmail, resolveEmail } from "../server/src/identity";

test("resolveEmail prefers the Cloudflare Access header over everything", () => {
  const email = resolveEmail({
    cfHeader: "CF@Example.com",
    optionEmail: "opt@example.com",
    fallbackEmail: "fb@example.com",
  });
  assert.equal(email, "cf@example.com"); // normalized to lowercase
});

test("resolveEmail handles a header delivered as an array", () => {
  assert.equal(resolveEmail({ cfHeader: ["a@x.com", "b@x.com"] }), "a@x.com");
});

test("resolveEmail falls back to the option, then the env fallback", () => {
  assert.equal(
    resolveEmail({ cfHeader: null, optionEmail: "opt@x.com", fallbackEmail: "fb@x.com" }),
    "opt@x.com",
  );
  assert.equal(
    resolveEmail({ cfHeader: null, optionEmail: "  ", fallbackEmail: "fb@x.com" }),
    "fb@x.com",
  );
});

test("resolveEmail returns null when nothing usable is present", () => {
  assert.equal(resolveEmail({}), null);
  assert.equal(resolveEmail({ cfHeader: "", optionEmail: 42, fallbackEmail: "" }), null);
});

test("guestNameFromEmail uses the local part, else 'Guest'", () => {
  assert.equal(guestNameFromEmail("jane.doe@x.com"), "jane.doe");
  assert.equal(guestNameFromEmail(null), "Guest");
  assert.equal(guestNameFromEmail("@x.com"), "Guest");
});
