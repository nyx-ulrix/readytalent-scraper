// Self-check for the job-board filter rules. Run: node test/boards.test.cjs
const assert = require("node:assert/strict");
const { _test: { passes, workFrom, empKey, skillsIn, indeedHost } } = require("../electron/boards.cjs");

const base = { jobTypes: [], workplace: [], levels: [], companyInclude: "", companyExclude: "" };
assert.ok(passes({ company: "Shopee" }, base), "no filters: everything passes");
assert.ok(passes({ company: "Shopee Singapore" }, { ...base, companyInclude: "google, shopee" }), "include is a case-insensitive contains");
assert.ok(!passes({ company: "Acme Recruitment" }, { ...base, companyExclude: "recruitment; staffing" }), "exclude wins");
assert.ok(!passes({ company: "X", employmentKeys: ["fulltime"] }, { ...base, jobTypes: ["internship"] }), "known type outside the filter is dropped");
assert.ok(passes({ company: "X", employmentKeys: [] }, { ...base, jobTypes: ["internship"] }), "unknown type is kept (board already filtered)");
assert.ok(!passes({ company: "X", workplace: "On-site" }, { ...base, workplace: ["remote", "hybrid"] }));
assert.equal(workFrom("Singapore (Hybrid)"), "Hybrid");
assert.equal(workFrom("Remote in Singapore"), "Remote");
assert.equal(workFrom("Singapore"), "");
assert.equal(empKey("Full-time"), "fulltime");
assert.equal(empKey("Internship"), "internship");
assert.deepEqual(skillsIn("SQL, Power BI and Python; not JavaScripting", ["SQL", "Python", "Power BI", "JavaScript"]), ["SQL", "Python", "Power BI"]);
assert.equal(indeedHost("Singapore"), "sg.indeed.com");
assert.equal(indeedHost("Remote"), "www.indeed.com");
console.log("boards self-check OK");
