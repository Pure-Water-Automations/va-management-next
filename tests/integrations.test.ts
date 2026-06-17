import test from "node:test";
import assert from "node:assert/strict";
import { parseHoursString, pickNumber } from "../src/lib/desklog";
import { parseApplicationRows } from "../src/lib/forms-intake";

test("parseHoursString handles DeskLog duration formats", () => {
  assert.equal(parseHoursString("1:30"), 1.5);
  assert.equal(parseHoursString("1 h 30 m"), 1.5);
  assert.equal(parseHoursString("1 30"), 1.5);
  assert.equal(parseHoursString("--"), 0);
  assert.equal(parseHoursString("2.25"), 2.25);
});

test("pickNumber tolerates DeskLog field aliases and percent strings", () => {
  const activityAliases = ["activity_percentage", "activity_pct", "activity"];

  assert.equal(pickNumber({ activity_percentage: "87%" }, activityAliases), 87);
  assert.equal(pickNumber({ activity_pct: 76 }, activityAliases), 76);
  assert.equal(pickNumber({ activity: "65.5" }, activityAliases), 65.5);
  assert.equal(
    pickNumber({ efficiency: "--" }, ["efficiency_percentage", "efficiency_pct", "efficiency"]),
    null,
  );
});

test("parseApplicationRows maps form headers case-insensitively", () => {
  const rows = parseApplicationRows([
    ["Timestamp", "Full Name", "Email Address", "Primary Skills", "Other SKILLS"],
    ["2026-06-13", "Aira Mangila", "aira@example.com", "Operations", "Comms"],
    ["2026-06-13", "Marc Lumabi", "marc@example.com", "Automation", ""],
    ["", "", "", "", ""],
  ]);

  assert.deepEqual(rows, [
    {
      name: "Aira Mangila",
      email: "aira@example.com",
      skillsRoleTags: "Operations, Comms",
    },
    {
      name: "Marc Lumabi",
      email: "marc@example.com",
      skillsRoleTags: "Automation",
    },
  ]);
});
