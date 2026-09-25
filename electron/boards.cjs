/**
 * LinkedIn + Indeed search, run only when the user presses Search on the Search page.
 *
 * Both boards load in one hidden Chromium window (real browser, own cookie jar) and are read
 * from the rendered page:
 * - LinkedIn: the public "guest" jobs endpoints (list cards, then one detail page per NEW job).
 * - Indeed: the search results page's embedded card data. Indeed puts full descriptions behind a
 *   human-verification check, so Indeed jobs keep the card summary, salary, job type and tags.
 * Requests are paced and capped by the user's "results per term"; a block stops that board for the run.
 */
const { BrowserWindow } = require("electron");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pace = () => wait(1200 + Math.random() * 1300); // be polite between page loads
const enc = encodeURIComponent;

/** Search filters: key -> label, and each board's own URL parameter values. */
const EMP = { fulltime: "Full-time", parttime: "Part-time", contract: "Contract", temporary: "Temporary", internship: "Internship" };
const WORK = { onsite: "On-site", remote: "Remote", hybrid: "Hybrid" };
const LEVEL = { internship: "Internship", entry: "Entry level", associate: "Associate", mid: "Mid-Senior level", director: "Director", executive: "Executive" };
const LI_EMP = { fulltime: "F", parttime: "P", contract: "C", temporary: "T", internship: "I" };
const LI_WORK = { onsite: "1", remote: "2", hybrid: "3" };
const LI_LEVEL = { internship: "1", entry: "2", associate: "3", mid: "4", director: "5", executive: "6" };
const IN_LEVEL = { entry: "ENTRY_LEVEL", internship: "ENTRY_LEVEL", associate: "MID_LEVEL", mid: "MID_LEVEL", director: "SENIOR_LEVEL", executive: "SENIOR_LEVEL" };
const INDEED_REMOTE = "032b3046-06a3-4876-8dfd-474eb5e7ed11"; // Indeed's "Remote" filter id

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const empKey = (label) => Object.keys(EMP).find((k) => norm(EMP[k]) === norm(label)) || "";
const workFrom = (text) => (/hybrid/i.test(text) ? "Hybrid" : /remote|work from home/i.test(text) ? "Remote" : /on-?site/i.test(text) ? "On-site" : "");
const csv = (s) => String(s || "").split(/[,;\n]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);

/** Company include/exclude and, when the board could not filter server-side, type/workplace. */
function passes(job, opts) {
  const company = String(job.company || "").toLowerCase();
  const inc = csv(opts.companyInclude), exc = csv(opts.companyExclude);
  if (inc.length && !inc.some((c) => company.includes(c))) return false;
  if (exc.some((c) => company.includes(c))) return false;
  if (opts.jobTypes.length && job.employmentKeys && job.employmentKeys.length && !job.employmentKeys.some((k) => opts.jobTypes.includes(k))) return false;
  if (opts.workplace.length && job.workplace && !opts.workplace.some((k) => WORK[k] === job.workplace)) return false;
  return true;
}

let win = null;
let cancelled = false;
function boardWindow() {
  if (win && !win.isDestroyed()) return win;
  win = new BrowserWindow({ show: false, width: 1440, height: 1000, title: "Job boards", webPreferences: { partition: "jobboards", contextIsolation: true, nodeIntegration: false } });
  win.on("closed", () => { win = null; });
  return win;
}

/** Load a URL in the hidden window; returns the HTTP status and final URL. */
async function load(url) {
  const wc = boardWindow().webContents;
  let code = 0;
  const onNav = (_e, _url, httpCode) => { code = httpCode; };
  wc.on("did-navigate", onNav);
  try { await wc.loadURL(url); } catch (e) { if (!/ERR_ABORTED|ERR_HTTP_RESPONSE_CODE_FAILURE/.test(String(e))) throw e; }
  finally { wc.off("did-navigate", onNav); }
  return { wc, code, url: wc.getURL() };
}

function indeedHost(location) {
  const l = location.toLowerCase();
  const map = { singapore: "sg", malaysia: "malaysia", australia: "au", "united kingdom": "uk", uk: "uk", india: "in", canada: "ca", "hong kong": "hk", philippines: "ph", indonesia: "id" };
  for (const [k, v] of Object.entries(map)) if (l.includes(k)) return `${v}.indeed.com`;
  return "www.indeed.com";
}

/** Whole-word, case-insensitive skill matching against a dictionary (same rule as src/ground.ts). */
function skillsIn(text, dictionary) {
  const t = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  const out = [];
  for (const s of dictionary) {
    const esc = s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, "u").test(t)) out.push(s);
    if (out.length >= 25) break;
  }
  return out;
}

const LI_CARDS = `[...document.querySelectorAll("[data-entity-urn*='jobPosting']")].map((c) => ({
  id: c.getAttribute("data-entity-urn").split(":").pop(),
  title: (c.querySelector(".base-search-card__title") || {}).innerText?.trim() || "",
  company: (c.querySelector(".base-search-card__subtitle") || {}).innerText?.trim() || "",
  location: (c.querySelector(".job-search-card__location") || {}).innerText?.trim() || "",
  posted: (c.querySelector("time") || { getAttribute: () => "" }).getAttribute("datetime") || "",
  salary: ((c.querySelector(".job-search-card__salary-info") || {}).innerText || "").replace(/\\s+/g, " ").trim(),
  url: ((c.querySelector("a.base-card__full-link") || {}).href || "").split("?")[0],
}))`;

const LI_DETAIL = `({
  description: (document.querySelector(".show-more-less-html__markup, .description__text") || {}).innerText?.trim() || "",
  criteria: [...document.querySelectorAll(".description__job-criteria-item")].map((i) => [
    (i.querySelector(".description__job-criteria-subheader") || {}).innerText?.trim() || "",
    (i.querySelector(".description__job-criteria-text") || {}).innerText?.trim() || "",
  ]),
  salary: ((document.querySelector(".compensation__salary") || {}).innerText || "").replace(/\\s+/g, " ").trim(),
})`;

const INDEED_CARDS = `(() => {
  const rs = (((window.mosaic || {}).providerData || {})["mosaic-provider-jobcards"] || {}).metaData?.mosaicProviderJobCardsModel?.results;
  if (!rs) return null;
  const text = (h) => { const d = document.createElement("div"); d.innerHTML = (h || "").replace(/<li[^>]*>/gi, "\\n- "); return d.innerText.trim(); };
  return rs.map((r) => ({
    id: r.jobkey, title: r.displayTitle || r.title || "", company: r.company || "", location: r.formattedLocation || "",
    salary: (r.salarySnippet && r.salarySnippet.text) || "", types: r.jobTypes || [],
    tags: ((r.jobCardRequirementsModel || {}).jobTagRequirements || []).map((x) => x.label).filter(Boolean),
    snippet: text(r.snippet), posted: r.pubDate ? new Date(r.pubDate).toISOString().slice(0, 10) : "",
    remote: ((r.taxonomyAttributes || []).find((t) => t.label === "remote") || { attributes: [] }).attributes.map((a) => a.label).join(" "),
  }));
})()`;

async function linkedin(term, opts, known, found, say) {
  const pages = Math.ceil(opts.perTerm / 10);
  let kept = 0;
  for (let p = 0; p < pages && kept < opts.perTerm && !cancelled; p++) {
    const f = (map, keys, name) => (keys.length ? `&${name}=${enc(keys.map((k) => map[k]).join(","))}` : "");
    const listUrl = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${enc(term)}&location=${enc(opts.location)}&f_TPR=r${opts.days * 86400}${f(LI_EMP, opts.jobTypes, "f_JT")}${f(LI_WORK, opts.workplace, "f_WT")}${f(LI_LEVEL, opts.levels, "f_E")}&start=${p * 10}`;
    const { wc, code, url } = await load(listUrl);
    if (code === 429 || /authwall|login|checkpoint/.test(url)) throw Object.assign(new Error("LinkedIn is rate-limiting guest searches right now. Try again in a while."), { blocked: true });
    const cards = code >= 400 ? [] : await wc.executeJavaScript(LI_CARDS, true).catch(() => []);
    if (!cards.length) break;
    for (const c of cards) {
      if (kept >= opts.perTerm || cancelled) break;
      kept++;
      const id = `li-${c.id}`;
      if (found.has(id)) { found.get(id).terms = [...new Set([...found.get(id).terms, term])]; continue; }
      if (!passes({ company: c.company }, opts)) continue;
      if (known.has(id)) { found.set(id, { ...known.get(id), terms: [...new Set([...(known.get(id).terms || []), term])], lastSeen: new Date().toISOString() }); continue; }
      say(`LinkedIn · "${term}" · ${c.title} @ ${c.company}`);
      await pace();
      const d = await load(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${c.id}`)
        .then(({ wc: w, code: dc }) => (dc === 429 ? null : w.executeJavaScript(LI_DETAIL, true)))
        .catch(() => null);
      const crit = Object.fromEntries((d?.criteria || []).filter(([k]) => k));
      found.set(id, {
        id, source: "linkedin", url: c.url || `https://www.linkedin.com/jobs/view/${c.id}`,
        title: c.title, company: c.company, location: c.location, salary: d?.salary || c.salary,
        type: [crit["Employment type"], crit["Seniority level"]].filter(Boolean).join(" · "),
        employment: crit["Employment type"] || "", level: crit["Seniority level"] || "",
        // LinkedIn does not state the workplace on guest pages: use the filter if exactly one was asked for, else the location text.
        workplace: opts.workplace.length === 1 ? WORK[opts.workplace[0]] : workFrom(c.location),
        description: d?.description || "", requirements: (d?.criteria || []).filter(([k, v]) => k && v).map(([k, v]) => `${k}: ${v}`).join("\n"),
        posted: c.posted, terms: [term],
      });
    }
    await pace();
  }
}

async function indeed(term, opts, known, found, say) {
  const host = indeedHost(opts.location);
  let kept = 0;
  for (let start = 0; kept < opts.perTerm && !cancelled; start += 10) {
    say(`Indeed · "${term}" · page ${start / 10 + 1}`);
    const jt = opts.jobTypes.length === 1 ? `&jt=${opts.jobTypes[0]}` : "";
    const remote = opts.workplace.length === 1 && opts.workplace[0] === "remote" ? `&remotejob=${INDEED_REMOTE}` : "";
    const lv = [...new Set(opts.levels.map((k) => IN_LEVEL[k]))];
    const explvl = lv.length === 1 ? `&explvl=${lv[0]}` : "";
    const { wc } = await load(`https://${host}/jobs?q=${enc(term)}&l=${enc(opts.location)}&fromage=${opts.days}${jt}${remote}${explvl}&start=${start}`);
    let cards = null;
    for (let i = 0; i < 8 && !cards; i++) { cards = await wc.executeJavaScript(INDEED_CARDS, true).catch(() => null); if (!cards) await wait(1000); }
    if (!cards) {
      const title = await wc.executeJavaScript("document.title", true).catch(() => "");
      if (/just a moment|security check|verify/i.test(title)) throw Object.assign(new Error("Indeed is asking for a human verification check. Use \"Open Indeed window\" to complete it yourself, then search again."), { blocked: true, indeed: true });
      break;
    }
    if (!cards.length) break;
    for (const c of cards) {
      if (kept >= opts.perTerm) break;
      kept++;
      const id = `in-${c.id}`;
      if (found.has(id)) { found.get(id).terms = [...new Set([...found.get(id).terms, term])]; continue; }
      const employmentKeys = c.types.map(empKey).filter(Boolean);
      const workplace = workFrom(`${c.remote} ${c.location}`) || (opts.workplace.length === 1 && remote ? "Remote" : "");
      if (!passes({ company: c.company, employmentKeys, workplace }, opts)) continue;
      const prev = known.get(id);
      found.set(id, {
        ...(prev || {}),
        id, source: "indeed", url: `https://${host}/viewjob?jk=${c.id}`,
        title: c.title, company: c.company, location: c.location, salary: c.salary, type: c.types.join(", "),
        employment: c.types.join(", "), workplace, level: explvl && opts.levels.length === 1 ? LEVEL[opts.levels[0]] : "",
        description: c.snippet, requirements: c.tags.length ? `Requirements listed on Indeed: ${c.tags.join(", ")}` : "",
        tags: c.tags, posted: c.posted, terms: [...new Set([...((prev && prev.terms) || []), term])],
      });
    }
    if (cards.length < 10) break;
    await pace();
  }
}

/**
 * opts: { terms, location, linkedin, indeed, perTerm, days }. known: Map of stored jobs by id.
 * Returns { jobs: Map of jobs seen this run, errors: string[] }.
 */
async function searchBoards(opts, known, dictionary, say) {
  cancelled = false;
  const found = new Map();
  const errors = [];
  const live = { linkedin: !!opts.linkedin, indeed: !!opts.indeed };
  for (const term of opts.terms) {
    for (const board of ["linkedin", "indeed"]) {
      if (!live[board] || cancelled) continue;
      try { await (board === "linkedin" ? linkedin : indeed)(term, opts, known, found, say); }
      catch (e) {
        errors.push(e.message);
        if (e.blocked) live[board] = false; // stop hammering a board that pushed back
      }
    }
    if (cancelled) { errors.push("Stopped."); break; }
  }
  const now = new Date().toISOString();
  for (const j of found.values()) {
    j.scrapedAt = j.scrapedAt || now;
    j.lastSeen = now;
    j.active = true;
    j.skills = [...new Set([...(j.tags || []), ...skillsIn(`${j.title}\n${j.description}\n${j.requirements}`, dictionary)])];
    for (const k of ["deadline", "vacancies", "website", "companyProfile"]) j[k] = j[k] || "";
  }
  return { jobs: found, errors: [...new Set(errors)] };
}

/**
 * Visible text of one job posting page (the user pasted its link). Pages behind a bot check are not
 * worked around: the user is asked to copy the text from their own browser instead.
 */
async function pageText(url) {
  if (!/^https?:\/\//i.test(url)) throw new Error("Paste the full link, starting with https://");
  const { code } = await load(url);
  const wc = boardWindow().webContents;
  await new Promise((r) => setTimeout(r, 2500)); // let the page's scripts render the posting
  const text = String(await wc.executeJavaScript("document.body ? document.body.innerText : ''"));
  if (/just a moment|verify you are (a )?human|checking your browser|captcha|security check/i.test(text.slice(0, 3000)) || code === 403)
    throw new Error("That site shows a bot check. Open the posting in your browser, copy its text and paste it here instead.");
  if (text.trim().length < 200) throw new Error("Couldn't read a posting on that page (it may need a sign-in). Copy the posting's text and paste it here instead.");
  return text.slice(0, 40000);
}

module.exports = {
  searchBoards,
  pageText,
  stopBoards: () => { cancelled = true; },
  showBoardWindow: () => { const w = boardWindow(); w.show(); w.focus(); },
  _test: { skillsIn, indeedHost, passes, workFrom, empKey },
};
