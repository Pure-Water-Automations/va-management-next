import { test } from "node:test";
import assert from "node:assert/strict";
import type { ClientPortalAccessContext, ClientScopedTaskResource } from "../src/lib/client-portal/types";

const loadPermissions = () => import("../src/lib/client-portal/permissions");
const loadIntake = () => import("../src/lib/client-portal/task-intake");
const loadService = () => import("../src/lib/client-portal/service-scaffold");

const clientAdmin: ClientPortalAccessContext = {
  userId: "client-admin-1",
  actorKind: "client",
  role: "CLIENT_ADMIN",
  clientOrganizationIds: ["client-a"],
};

const clientMember: ClientPortalAccessContext = {
  userId: "client-member-1",
  actorKind: "client",
  role: "CLIENT_MEMBER",
  clientOrganizationIds: ["client-a"],
};

const teamLead: ClientPortalAccessContext = {
  userId: "team-lead-1",
  actorKind: "internal",
  role: "TEAM_LEAD",
  clientOrganizationIds: ["client-a"],
};

const va: ClientPortalAccessContext = {
  userId: "va-1",
  actorKind: "internal",
  role: "VA",
  clientOrganizationIds: ["client-a"],
  assignedTaskIds: ["task-assigned"],
};

const taskForClientA: ClientScopedTaskResource = {
  id: "task-a",
  clientOrganizationId: "client-a",
  assignedToUserId: "va-2",
};

const assignedTaskForVa: ClientScopedTaskResource = {
  id: "task-assigned",
  clientOrganizationId: "client-b",
  assignedToUserId: "va-1",
};

test("client users cannot access another client's visible resource", async () => {
  const { canSeeVisibility } = await loadPermissions();
  assert.equal(
    canSeeVisibility(clientAdmin, {
      clientOrganizationId: "client-b",
      visibility: "client_visible",
    }),
    false,
  );
});

test("client users can see client-visible resources inside their organization", async () => {
  const { canSeeVisibility } = await loadPermissions();
  assert.equal(
    canSeeVisibility(clientMember, {
      clientOrganizationId: "client-a",
      visibility: "client_visible",
    }),
    true,
  );
});

test("clients cannot see internal-only resources even in their organization", async () => {
  const { canSeeVisibility } = await loadPermissions();
  assert.equal(
    canSeeVisibility(clientAdmin, {
      clientOrganizationId: "client-a",
      visibility: "internal_only",
    }),
    false,
  );
});

test("team leads can publish client-visible comments, VAs cannot publish directly in MVP", async () => {
  const { canAddClientVisibleComment } = await loadPermissions();
  assert.equal(canAddClientVisibleComment(teamLead, taskForClientA), true);
  assert.equal(canAddClientVisibleComment(va, taskForClientA), false);
});

test("VAs can see explicitly assigned tasks without broad org access", async () => {
  const { canViewClientTask } = await loadPermissions();
  assert.equal(canViewClientTask(va, assignedTaskForVa), true);
});

test("intake rejects invalid due dates", async () => {
  const { clientTaskIntakeSchema } = await loadIntake();
  const parsed = clientTaskIntakeSchema.safeParse({
    clientOrganizationId: "client-a",
    requestedByUserId: "client-member-1",
    title: "Create a flyer",
    desiredOutcome: "Create a polished flyer for the upcoming community event.",
    dueDate: "not-a-date",
  });
  assert.equal(parsed.success, false);
});

test("client intake builds a request draft, not an assigned task", async () => {
  const { buildClientTaskRequestDraft } = await loadService();
  const draft = buildClientTaskRequestDraft({
    clientOrganizationId: "client-a",
    requestedByUserId: "client-member-1",
    title: "Create a flyer",
    desiredOutcome: "Create a polished flyer for the upcoming community event.",
  });

  assert.equal(draft.status, "received");
  assert.equal(draft.source, "client_portal");
  assert.equal(draft.visibility, "client_visible");
  assert.equal("assignedToId" in draft, false);
});
