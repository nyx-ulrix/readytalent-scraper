// Self-check for scrape.cjs against a fake ReadyTalent gateway. Run: node electron/scrape.test.cjs
const assert = require("node:assert/strict");
const scrapeInPage = require("./scrape.cjs");

const F = "@OData.Community.Display.V1.FormattedValue";
const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
global.document = { getElementById: () => ({ value: "https://gw.example/Prod?" }) };
global.sessionStorage = store();
global.localStorage = store();
const calls = [];
let ampOnly = false; // the gateway reads only the My Applications page's "&amp;" form
const APPS = [
  { _sit_employmentlisting_value: "A", [`_sit_employmentlisting_value${F}`]: "Software Engineer", [`sit_applicationstatus${F}`]: "Shortlisted", sit_dateapplied: "2026-10-01T02:00:00Z", [`_sit_company_value${F}`]: "Acme Pte Ltd" },
  { _sit_employmentlisting_value: "OLD", [`_sit_employmentlisting_value${F}`]: "Data Intern", [`sit_applicationstatus${F}`]: "Unsuccessful", [`_sit_employmenttype_value${F}`]: "Internship" },
  { sit_studentapplicationid: "no-listing" },
];
global.fetch = async (url, init) => {
  calls.push({ url, token: init.headers.apitoken });
  const q = new URL(url).searchParams;
  const body = {
    LoadJobDetailsStudentDashboard: [
      { sit_employmentlistingid: "A", sit_name: "Software Engineer", _sit_employmentsessionid_value: "S1", "ab.sit_degreeprogramname": "Bachelor of Engineering (Hons) in Software Engineering | Bachelor of Science (Hons) in Computing Science", _sit_applicationcycle_value: "C1", "bo.sit_activeapplicationcycle": "C1", [`_sit_account_value${F}`]: "Acme Pte Ltd", [`_sit_employmenttype_value${F}`]: "Full-Time" },
      { sit_employmentlistingid: "A" }, // duplicate row
      { sit_employmentlistingid: "KNOWN", sit_name: "Already scraped" },
    ],
    LoadPartTimeJobDetailsStudentDashboard: [
      { sit_employmentlistingid: "B", sit_name: "Barista", [`sit_allowance${F}`]: "$12/hr", [`_sit_employmenttype_value${F}`]: "Part-Time" },
    ],
    GetEmploymentListingById: { _sit_employmentsessionid_value: "S2" },
    GetEmploymentTypeWOSSWS: [{ sit_name: "Full-Time" }, { sit_name: "Integrated Work Study Programme (IWSP)" }, { sit_name: null }],
    GetDegreeProgram: [{ sit_name: "Bachelor of Engineering (Hons) in Software Engineering" }],
    GetManageApplicationsForStudents: (ampOnly ? q.get("amp;ContactId") : q.get("ContactId")) === "c1" ? APPS : null,
    LoadJobDetailsForStudent: q.get("jobid") === "A"
      ? [{ sit_employmentlistingid: "A", "acc.name": "Acme Pte Ltd", sit_jobdescription: "<p>Build things</p><ul><li>Ship &amp; learn</li></ul>", sit_jobrequirements: "Degree in CS", sit_skillset: "Python, React; SQL", [`sit_remunerationrange1${F}`]: "$4,000", [`sit_remunerationrange2${F}`]: "$5,000", "otheradd.sit_name": "Singapore", "otheradd.sit_street1": "Punggol", [`sit_applicationdeadline${F}`]: "31/12/2026", [`sit_numberofvacancies${F}`]: "2", "acc.websiteurl": "https://acme.example" }]
      : [{ sit_employmentlistingid: "other" }],
  }[q.get("requestname")];
  return { headers: { get: (h) => (h === "apitoken" ? "tok-" + calls.length : null) }, text: async () => JSON.stringify(body) };
};

(async () => {
  await assert.rejects(scrapeInPage([]), /Not signed in/);
  sessionStorage.setItem("StudentId", "stu1");
  sessionStorage.setItem("usertype", "Student");
  sessionStorage.setItem("ContactId", "c1");
  const r = await scrapeInPage(["KNOWN"]);
  assert.deepEqual(r.activeIds, ["A", "KNOWN", "B"]);
  assert.equal(r.jobs.length, 2, "known id skipped, duplicate merged");
  const a = r.jobs[0];
  assert.equal(a.title, "Software Engineer");
  assert.equal(a.company, "Acme Pte Ltd");
  assert.equal(a.salary, "$4,000 - $5,000");
  assert.equal(a.location, "Singapore - Punggol");
  assert.deepEqual(a.skills, ["Python", "React", "SQL"]);
  assert.equal(a.description, "Build things\n- Ship & learn");
  assert.equal(a.requirements, "Degree in CS");
  assert.equal(a.deadline, "31/12/2026");
  assert.equal(a.active, true);
  assert.deepEqual(a.programmes, ["Bachelor of Engineering (Hons) in Software Engineering", "Bachelor of Science (Hons) in Computing Science"]);
  assert.deepEqual(r.meta, { employmentTypes: ["Full-Time", "Integrated Work Study Programme (IWSP)"], programmes: ["Bachelor of Engineering (Hons) in Software Engineering"] });
  const b = r.jobs[1];
  assert.equal(b.salary, "$12/hr", "falls back to allowance");
  assert.equal(b.type, "Part-Time");
  assert.ok(calls.some((c) => c.url.includes("GetEmploymentListingById&jobId=B")), "looks up missing session id");
  assert.equal(calls.at(-1).token, "tok-" + (calls.length - 1), "rotated apitoken is reused on next call");
  assert.deepEqual(r.applications.map((x) => [x.jobId, x.status, x.title]), [["A", "Shortlisted", "Software Engineer"], ["OLD", "Unsuccessful", "Data Intern"]], "applications read, rows without a listing skipped");
  assert.equal(r.applications[0].appliedAt, "2026-10-01T02:00:00Z");
  ampOnly = true;
  const r2 = await scrapeInPage(["KNOWN", "A", "B"]);
  assert.equal(r2.applications.length, 2, "falls back to the page's &amp; form");
  console.log("scrape self-check OK");
})().catch((e) => { console.error(e); process.exit(1); });
