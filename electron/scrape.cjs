/**
 * Runs INSIDE the logged-in ReadyTalent page (injected via webContents.executeJavaScript).
 * Uses the portal's own AWS gateway (`amazonUrl`) exactly like its search page does:
 *   LoadJobDetailsStudentDashboard / LoadPartTimeJobDetailsStudentDashboard -> list
 *   LoadJobDetailsForStudent -> description, requirements, skill set, pay
 * Must be self-contained: no closures over Node scope.
 */
async function scrapeInPage(knownIds) {
  const known = new Set(knownIds);
  const base =
    (document.getElementById("amazonUrlSetting") || {}).value ||
    (typeof amazonUrl === "string" ? amazonUrl : "");
  if (!base) throw new Error("This is not a ReadyTalent page. Sign in, then open Job Search.");
  const studentId = sessionStorage.getItem("StudentId");
  const userType = sessionStorage.getItem("usertype") || "Student";
  if (!studentId) throw new Error("Not signed in yet. Sign in as Student/Alumni in the ReadyTalent window, then click Scrape again.");

  const call = async (param) => {
    const token = localStorage.getItem("apitoken") || sessionStorage.getItem("apitoken") || "";
    const r = await fetch(base + param, { method: "POST", headers: token ? { apitoken: token } : {} });
    const t = r.headers.get("apitoken");
    if (t) { localStorage.setItem("apitoken", t); sessionStorage.setItem("apitoken", t); }
    const text = await r.text();
    try { return JSON.parse(text); } catch { return null; }
  };

  let access = "";
  if (userType === "Alumni") {
    access = "<link-entity name='sit_employmenttype' from='sit_employmenttypeid' to='sit_employmenttype' link-type='inner' alias='etype'><filter type='and'><condition attribute='sit_limitedfullaccess' operator='eq' value='2' /></filter></link-entity>";
  }
  const full = await call(`requestname=LoadJobDetailsStudentDashboard&studentId=${studentId}&accessLevelCondition=${access}`);
  const part = await call(`requestname=LoadPartTimeJobDetailsStudentDashboard&studentId=${studentId}&accessLevelCondition=${access}&loginaccessType=${userType}`);
  const rows = [...(Array.isArray(full) ? full : []), ...(Array.isArray(part) ? part : [])];
  if (!rows.length) throw new Error("Portal returned no jobs (session may have expired - reload the ReadyTalent window).");

  const fmt = (r, k) => r[k + "@OData.Community.Display.V1.FormattedValue"] ?? r[k] ?? "";
  const strip = (h) =>
    String(h || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  const salaryOf = (r) => {
    const r1 = fmt(r, "sit_remunerationrange1"), r2 = fmt(r, "sit_remunerationrange2");
    if (r1 || r2) return [r1, r2].filter(Boolean).join(" - ");
    return fmt(r, "sit_remuneration") || fmt(r, "sit_totalallowance") || fmt(r, "sit_allowance") || fmt(r, "sit_remunerationothers") || "";
  };

  // The website's own dropdown lists (Employment Types / Programmes on the search page).
  const names = (arr) => (Array.isArray(arr) ? arr.map((x) => x && x.sit_name).filter(Boolean) : []);
  const meta = {
    employmentTypes: [...new Set(names(await call("requestname=GetEmploymentTypeWOSSWS")))],
    programmes: [...new Set(names(await call("requestname=GetDegreeProgram")))].sort(),
  };

  const seen = new Set();
  const todo = [];
  for (const r of rows) {
    const id = r.sit_employmentlistingid;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (!known.has(id)) todo.push(r);
  }

  const out = [];
  let i = 0;
  for (const r of todo) {
    i++;
    console.log("AP_PROGRESS", i, todo.length);
    const id = r.sit_employmentlistingid;
    let sess = r._sit_employmentsessionid_value;
    if (!sess) {
      const s = await call(`requestname=GetEmploymentListingById&jobId=${id}&select=_sit_employmentsessionid_value`);
      sess = (s && s._sit_employmentsessionid_value) || "";
    }
    let d = r;
    try {
      const det = await call(`requestname=LoadJobDetailsForStudent&jobid=${id}&studentId=${studentId}&empSessionId=${sess}&includeApplicabledate=true`);
      const hit = Array.isArray(det) && det.find((x) => x.sit_employmentlistingid === id);
      if (hit) d = { ...r, ...hit };
    } catch { /* keep list row */ }
    const skillsRaw = strip(d.sit_skillset);
    out.push({
      id,
      title: d.sit_name || "",
      company: d["acc.name"] || fmt(d, "_sit_account_value"),
      type: fmt(d, "_sit_employmenttype_value"),
      programmes: String(d["ab.sit_degreeprogramname"] || "").split("|").map((s) => s.trim()).filter(Boolean),
      salary: salaryOf(d),
      location: [d["otheradd.sit_name"], d["otheradd.sit_street1"]].filter(Boolean).join(" - ") || fmt(d, "acc.sit_countryid"),
      skills: skillsRaw.split(/[,;\n]+/).map((s) => s.replace(/^-\s*/, "").trim()).filter((s) => s && s.length < 60),
      description: strip(d.sit_jobdescription),
      requirements: strip(d.sit_jobrequirements),
      deadline: fmt(d, "sit_applicationdeadline"),
      posted: fmt(d, "sit_postingdate"),
      vacancies: fmt(d, "sit_numberofvacancies"),
      website: d["acc.websiteurl"] || "",
      companyProfile: strip(d["acc.sit_companyprofile"]),
      active: !r["bo.sit_activeapplicationcycle"] || r._sit_applicationcycle_value === r["bo.sit_activeapplicationcycle"],
      scrapedAt: new Date().toISOString(),
    });
  }
  return { jobs: out, activeIds: [...seen], meta };
}
module.exports = scrapeInPage;
