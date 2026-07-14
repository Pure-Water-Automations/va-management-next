import test from "node:test";
import assert from "node:assert/strict";
import { s256, verifyPkce } from "../src/lib/oauth/pkce";

// RFC 7636 Appendix B known vector.
test("s256 matches the RFC 7636 test vector", () => {
  assert.equal(s256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("verifyPkce accepts the matching verifier and rejects others", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  assert.equal(verifyPkce(verifier, s256(verifier)), true);
  assert.equal(verifyPkce("wrong-verifier", s256(verifier)), false);
  assert.equal(verifyPkce("", s256(verifier)), false);
  assert.equal(verifyPkce(verifier, ""), false);
});
