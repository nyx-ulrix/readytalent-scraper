// Self-check for the job-board filter rules. Run: node test/boards.test.cjs
const assert = require("node:assert/strict");
const { _test: { passes, workFrom, empKey, skillsIn, indeedHost, postingJob, salaryText, linkedinId, publicUrl } } = require("../electron/boards.cjs");

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
// Pasted links: schema.org JobPosting -> Job, no AI.
assert.equal(salaryText({ currency: "SGD", value: { minValue: 3000, maxValue: 4000, unitText: "MONTH" } }), "SGD 3,000 - 4,000 a month");
assert.equal(salaryText({ currency: "USD", value: { value: 25, unitText: "HOUR" } }), "USD 25 an hour");
assert.equal(linkedinId("https://www.linkedin.com/jobs/view/data-analyst-at-acme-4012345678/?trk=x"), "4012345678");
assert.equal(linkedinId("https://www.linkedin.com/jobs/search/?currentJobId=4012345678&keywords=x"), "4012345678");
assert.equal(linkedinId("https://example.com/jobs/view/123"), "");
assert.throws(() => publicUrl("http://192.168.1.5/admin"));
assert.throws(() => publicUrl("file:///C:/secret.txt"));
assert.throws(() => publicUrl("http://localhost:4242/api/state"));
const job = postingJob("https://careers.acme.com/jobs/42", {
  ld: { title: "Data Analyst Intern", hiringOrganization: { name: "Acme" }, employmentType: ["INTERN"], jobLocationType: "TELECOMMUTE",
    jobLocation: [{ address: { addressLocality: "Singapore", postalCode: "018956" } }], baseSalary: { currency: "SGD", value: { minValue: 1200, unitText: "MONTH" } },
    validThrough: "2026-10-31T23:59:00Z", datePosted: "2026-09-20", qualifications: "<p>SQL and Python</p>" },
  ldText: "Analyse data with SQL and Power BI.", li: { criteria: [] }, text: "",
}, ["SQL", "Python", "Power BI", "Java"]);
assert.equal(job.title, "Data Analyst Intern");
assert.equal(job.company, "Acme");
assert.equal(job.location, "Singapore, 018956");
assert.equal(job.salary, "SGD 1,200 a month");
assert.equal(job.employment, "Internship");
assert.equal(job.workplace, "Remote");
assert.equal(job.deadline, "2026-10-31");
assert.equal(job.requirements, "SQL and Python");
assert.deepEqual(job.skills, ["SQL", "Python", "Power BI"]);
assert.equal(job.source, "pasted");
assert.equal(job.id, postingJob("https://careers.acme.com/jobs/42?utm=x", { li: { criteria: [] }, text: "x" }, []).id, "same link = same saved job");
const bare = postingJob("https://jobs.example.org/7", { title: "Backend Engineer | Example Careers", li: { criteria: [] }, text: "We need Java." }, ["Java"]);
assert.equal(bare.title, "Backend Engineer");
assert.deepEqual(bare.skills, ["Java"]);
assert.equal(postingJob("https://x.io/1", { title: "Account Executive", pageTitle: "Job Application for Account Executive at Anthropic", li: { criteria: [] }, text: "" }, []).company, "Anthropic");
assert.equal(postingJob("https://job-boards.greenhouse.io/anthropic/jobs/4461450008", { title: "Account Executive", li: { criteria: [] }, text: "" }, []).company, "Anthropic");
assert.equal(postingJob("https://x.io/2", { ld: { title: "A", employmentType: ["FULL_TIME", "FULL_TIME"] }, li: { criteria: [] }, text: "" }, []).employment, "Full-time");
console.log("boards self-check OK");
