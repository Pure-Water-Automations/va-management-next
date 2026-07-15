import test from "node:test";
import assert from "node:assert/strict";

import {
  canSeeRecording,
  isPubliclyViewable,
  type ViewerUser,
  type VisibilityRec,
} from "../src/lib/actions/recording-access";

const admin: ViewerUser = { id: "u-admin", role: "HR_MANAGER", isAdmin: true, vaId: null };
const hr: ViewerUser = { id: "u-hr", role: "HR_MANAGER", isAdmin: false, vaId: null };
const va: ViewerUser = { id: "u-va", role: "VA", isAdmin: false, vaId: "va-1" };
const supervisor: ViewerUser = { id: "u-sup", role: "SENIOR_VA", isAdmin: false, vaId: "va-sup" };
const stranger: ViewerUser = { id: "u-x", role: "VA", isAdmin: false, vaId: "va-9" };

const rec = (over: Partial<VisibilityRec> = {}): VisibilityRec => ({
  uploaderUserId: "someone-else",
  vaId: "va-1",
  visibility: "internal",
  ownerSupervisorVaId: "va-sup",
  ...over,
});

test("admin sees everything, including private", () => {
  assert.equal(canSeeRecording(admin, rec({ visibility: "private", uploaderUserId: "z", vaId: "va-9" })), true);
});

test("the uploader always sees their own recording", () => {
  assert.equal(canSeeRecording(va, rec({ uploaderUserId: "u-va", visibility: "private", vaId: null })), true);
});

test("a VA sees recordings owned by their own VA row", () => {
  assert.equal(canSeeRecording(va, rec({ vaId: "va-1", uploaderUserId: "someone-else" })), true);
});

test("HR sees internal/link recordings but not others' private", () => {
  assert.equal(canSeeRecording(hr, rec({ visibility: "internal", vaId: "va-9" })), true);
  assert.equal(canSeeRecording(hr, rec({ visibility: "link", vaId: "va-9" })), true);
  assert.equal(canSeeRecording(hr, rec({ visibility: "private", vaId: "va-9" })), false);
});

test("a direct supervisor sees a report's non-private recording", () => {
  assert.equal(canSeeRecording(supervisor, rec({ vaId: "va-1", ownerSupervisorVaId: "va-sup" })), true);
  // ...but not if it's private
  assert.equal(canSeeRecording(supervisor, rec({ visibility: "private", ownerSupervisorVaId: "va-sup" })), false);
});

test("an unrelated VA cannot see someone else's recording", () => {
  assert.equal(
    canSeeRecording(stranger, rec({ uploaderUserId: "u-other", vaId: "va-1", ownerSupervisorVaId: "va-sup" })),
    false,
  );
});

test("a link recording is publicly viewable only while it's link + ready", () => {
  assert.equal(isPubliclyViewable({ visibility: "link", status: "ready" }), true);
  assert.equal(isPubliclyViewable({ visibility: "link", status: "uploading" }), false);
  assert.equal(isPubliclyViewable({ visibility: "internal", status: "ready" }), false);
  assert.equal(isPubliclyViewable({ visibility: "private", status: "ready" }), false);
});
