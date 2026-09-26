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

/* ---- One posting from a pasted link (no AI) ----
 * Most job sites publish the posting as schema.org JobPosting data for search engines (title, company,
 * pay, location, type, dates, description); LinkedIn links go through the same public guest page the
 * search uses. Anything else falls back to the page title and visible text. Bot checks are not worked
 * around: the user is asked to paste the text instead. */
const POSTING = `(() => {
  const text = (h) => { const d = document.createElement("div"); d.innerHTML = String(h || "").replace(/<li[^>]*>/gi, "\\n- ").replace(/<\\/(p|div|h\\d|ul|ol|li)>|<br\\s*\\/?>/gi, "\\n"); return (d.textContent || "").replace(/[ \\t]+\\n/g, "\\n").replace(/\\n{3,}/g, "\\n\\n").trim(); };
  const all = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap((s) => { try { const j = JSON.parse(s.textContent); return [].concat(j, (j && j["@graph"]) || []); } catch { return []; } });
  const ld = all.find((x) => x && [].concat(x["@type"]).includes("JobPosting")) || null;
  const meta = (n) => (document.querySelector('meta[property="' + n + '"], meta[name="' + n + '"]') || {}).content || "";
  const q = (s) => ((document.querySelector(s) || {}).innerText || "").trim();
  return {
    ld: ld && JSON.parse(JSON.stringify(ld)), ldText: ld ? text(ld.description) : "",
    title: q("h1") || meta("og:title") || document.title, pageTitle: meta("og:title") || document.title,
    li: {
      title: q(".top-card-layout__title, .topcard__title"), company: q(".topcard__org-name-link, .topcard__flavor a"),
      location: q(".topcard__flavor--bullet"), description: q(".show-more-less-html__markup, .description__text"),
      salary: q(".compensation__salary").replace(/\\s+/g, " "),
      criteria: [...document.querySelectorAll(".description__job-criteria-item")].map((i) => [
        ((i.querySelector(".description__job-criteria-subheader") || {}).innerText || "").trim(),
        ((i.querySelector(".description__job-criteria-text") || {}).innerText || "").trim()]),
    },
    text: document.body ? document.body.innerText : "",
  };
})()`;

const LD_EMP = { FULL_TIME: "Full-time", PART_TIME: "Part-time", CONTRACTOR: "Contract", TEMPORARY: "Temporary", INTERN: "Internship", INTERNSHIP: "Internship", PER_DIEM: "Temporary" };
const UNIT = { HOUR: "an hour", DAY: "a day", WEEK: "a week", MONTH: "a month", YEAR: "a year" };
const money = (n) => (typeof n === "number" || /^\d/.test(String(n)) ? Number(n).toLocaleString("en-US") : "");
/** schema.org baseSalary -> "SGD 3,000 - 4,000 a month" (readable by the pay filter). */
function salaryText(b) {
  if (!b) return "";
  if (typeof b === "string" || typeof b === "number") return String(b);
  const v = b.value && typeof b.value === "object" ? b.value : { value: b.value };
  const lo = money(v.minValue ?? v.value), hi = money(v.maxValue);
  if (!lo && !hi) return "";
  return [b.currency, [lo, hi].filter(Boolean).join(" - "), UNIT[String(v.unitText || b.unitText || "").toUpperCase()] || ""].filter(Boolean).join(" ");
}
const place = (l) => {
  const a = (l && l.address) || l || {};
  if (typeof a === "string") return a;
  const country = typeof a.addressCountry === "string" ? a.addressCountry : (a.addressCountry || {}).name;
  return [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, country].filter(Boolean).join(", ");
};
const textOf = (v) => [].concat(v || []).map((x) => (typeof x === "string" ? x : (x && (x.name || x.description)) || "")).filter(Boolean).join("\n");
const stripHtml = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** Canonical link for a LinkedIn job (…/jobs/view/…-123, ?currentJobId=123) -> its id, else "". */
const linkedinId = (url) => (/linkedin\.com/i.test(url) && (url.match(/currentJobId=(\d+)/) || url.match(/\/jobs\/view\/(?:[^/?]*-)?(\d+)/) || [])[1]) || "";

/** Only public web pages: no local files, localhost or private network addresses. */
function publicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error("That doesn't look like a link. Paste the full address, starting with https://"); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only web links (https://…) can be read.");
  if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$)/i.test(u.hostname) || !u.hostname.includes(".")) throw new Error("Only public job sites can be read.");
  return u.href;
}

/** Map what the page gave us to a Job (fields the renderer's Job type expects). */
function postingJob(url, p, dictionary) {
  const ld = p.ld || {};
  const li = p.li || {};
  const crit = Object.fromEntries((li.criteria || []).filter(([k]) => k));
  const siteSuffix = / *[|\-–—] *[^|\-–—]*$/; // "Engineer | Acme Careers" -> "Engineer"
  const title = stripHtml(ld.title) || li.title || String(p.title || p.pageTitle || "").replace(siteSuffix, "").trim();
  const org = ld.hiringOrganization;
  // "Job Application for Account Executive at Anthropic" -> Anthropic, when the page names no hiring organisation.
  // Hosted career pages name the company in the link: job-boards.greenhouse.io/anthropic/jobs/1 -> Anthropic.
  const { hostname, pathname } = new URL(url);
  const slug = /(greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com)$/.test(hostname) ? pathname.split("/")[1] || "" : "";
  const company = (typeof org === "string" ? org : (org && org.name) || "") || li.company || ((String(p.pageTitle || "").match(/\bat\s+([^|–—]+?)\s*(?:[|–—]|$)/) || [])[1] || "").trim()
    || slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const location = [].concat(ld.jobLocation || []).map(place).filter(Boolean).join(" · ") || li.location || "";
  const description = p.ldText || li.description || String(p.text || "").slice(0, 20000).trim();
  const requirements = [textOf(ld.qualifications), textOf(ld.skills), textOf(ld.experienceRequirements), textOf(ld.educationRequirements)]
    .map(stripHtml).filter(Boolean).join("\n") || Object.entries(crit).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
  const employment = [...new Set([].concat(ld.employmentType || []).map((e) => LD_EMP[String(e).toUpperCase()] || String(e)))].join(", ") || crit["Employment type"] || "";
  const workplace = /TELECOMMUTE/i.test(String(ld.jobLocationType || "")) ? "Remote" : workFrom(`${title} ${location}`);
  const now = new Date().toISOString();
  return {
    id: `pasted-${linkedinId(url) ? `li-${linkedinId(url)}` : require("crypto").createHash("sha1").update(url.replace(/[#?].*$/, "")).digest("hex").slice(0, 12)}`,
    source: "pasted", url, title: title || "Job posting", company, location, salary: salaryText(ld.baseSalary) || li.salary || "",
    type: employment, employment, workplace, level: crit["Seniority level"] || "",
    skills: skillsIn(`${title}\n${description}\n${requirements}`, dictionary), description, requirements,
    deadline: String(ld.validThrough || "").slice(0, 10), posted: String(ld.datePosted || "").slice(0, 10) || now.slice(0, 10),
    vacancies: String(ld.totalJobOpenings || ""), website: "", companyProfile: "", active: true, scrapedAt: now,
  };
}

async function scrapePosting(rawUrl, dictionary) {
  const url = publicUrl(String(rawUrl || "").trim());
  const id = linkedinId(url);
  const { wc, code } = await load(id ? `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}` : url);
  if (code === 429) throw new Error("The site is rate-limiting right now. Try again in a minute, or paste the posting's text.");
  await wait(id ? 300 : 2500); // let the page's scripts render the posting
  const p = await wc.executeJavaScript(POSTING, true);
  if (/just a moment|verify you are (a )?human|checking your browser|captcha|security check/i.test(String(p.text).slice(0, 3000)) || code === 403)
    throw new Error("That site shows a bot check. Open the posting in your browser, copy its text and paste it here instead.");
  if (!p.ld && !p.li.description && String(p.text).trim().length < 200)
    throw new Error("Couldn't find a job posting on that page (it may need a sign-in). Copy the posting's text and paste it here instead.");
  return postingJob(id ? `https://www.linkedin.com/jobs/view/${id}` : url, p, dictionary);
}

/** Visible text of any public page (e.g. the user's portfolio, for adding its details). */
async function pageText(rawUrl) {
  const { wc, code } = await load(publicUrl(String(rawUrl || "").trim()));
  await wait(2500); // let the page's scripts render
  const text = String(await wc.executeJavaScript("document.body ? document.body.innerText : ''"));
  if (/just a moment|verify you are (a )?human|checking your browser|captcha|security check/i.test(text.slice(0, 3000)) || code === 403)
    throw new Error("That site shows a bot check. Copy the page's text and paste it here instead.");
  if (text.trim().length < 100) throw new Error("Couldn't read anything on that page (it may need a sign-in). Copy its text and paste it here instead.");
  return text.slice(0, 40000);
}

module.exports = {
  searchBoards,
  scrapePosting,
  pageText,
  stopBoards: () => { cancelled = true; },
  showBoardWindow: () => { const w = boardWindow(); w.show(); w.focus(); },
  _test: { skillsIn, indeedHost, passes, workFrom, empKey, postingJob, salaryText, linkedinId, publicUrl },
};
