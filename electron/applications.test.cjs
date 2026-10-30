// Self-check for applications.cjs. Run: node electron/applications.test.cjs
const assert = require("node:assert/strict");
const { applyApplications } = require("./applications.cjs");

const before = { _rev: 7, applied: { MINE: "2026-09-01" }, rejected: {}, saved: ["A"] };
const apps = [
  { jobId: "A", status: "Shortlisted", appliedAt: "2026-10-01T02:00:00Z" },
  { jobId: "OLD", status: "Unsuccessful", appliedAt: "" },
  { jobId: "MINE", status: "Applied", appliedAt: "2026-10-05T00:00:00Z" },
];
const r = applyApplications(before, apps);
assert.equal(r.markedApplied, 2);
assert.equal(r.markedRejected, 1);
assert.equal(r.state.applied.A, "2026-10-01T02:00:00Z", "ReadyTalent's application date is kept");
assert.equal(r.state.applied.MINE, "2026-09-01", "your own mark is not overwritten");
assert.ok(r.state.applied.OLD && r.state.rejected.OLD, "rejected also counts as applied");
assert.equal(r.state.appStatus.A, "Shortlisted");
assert.equal(r.state._rev, 8);
assert.deepEqual(before.applied, { MINE: "2026-09-01" }, "input not mutated");
const again = applyApplications(r.state, apps);
assert.equal(again.state, null, "nothing new: no write");
assert.equal(applyApplications(null, apps).state, null, "no saved state yet: nothing to mark");
console.log("applications self-check OK");
