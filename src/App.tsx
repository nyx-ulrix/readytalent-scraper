import { useEffect, useMemo, useRef, useState } from "react";
import { fetchBoardJobs, fetchJobs, fetchMeta, geocode, useAppState } from "./store";
import { distanceKm, formatKm, placeQuery, type LatLon } from "./geo";
import { PROVIDERS, coverLetter, extractKeywords, generateSearchTerms, listModels, rankProfile, readPosting, suggestRoles, type SkillPrefs, matchKeywords, parseResume, pingModel, priceFor, priceTable, sourceText, tailorResume, type AiConfig, type ModelInfo, type Price, type Provider } from "./ai";

const KEY_OF: Record<Provider, "geminiKey" | "openaiKey" | "qwenKey" | "anthropicKey"> = { gemini: "geminiKey", openai: "openaiKey", qwen: "qwenKey", anthropic: "anthropicKey" };
/** "24 Sept 2026, 3:42 pm" for when a tailored resume / letter was generated; "" if unknown (made before timestamps). */
const stamp = (s: State, kind: "resume" | "letter", jobId: string) => {
  const iso = s.generatedAt?.[`${kind}:${jobId}`];
  return iso ? new Date(iso).toLocaleString("en-SG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
};
const aiCfg = (s: State): AiConfig => ({ provider: s.provider, key: s[KEY_OF[s.provider]], model: s.models?.[s.provider] || "" });
import { LetterPage, MIN_FONT_PT, ResumePage, type FitInfo } from "./Resume";
import { MARKER, toMarkdown } from "./markdown";
import { monthlyPay, payPasses } from "./pay";
import { MAX_PROJECTS, MAX_SKILLS, isLeadership, sectionKey, sectionLimit, shownCount } from "./limits";
import { DEFAULT_META, defaultState, emptyEntry, isDesktop, profileText, type Entry, type Job, type Meta, type Profile, type State, type Template } from "./types";

type Tab = "jobs" | "search" | "saved" | "applied" | "resume" | "settings";
type ListMode = "rt" | "boards" | "saved" | "applied";
type Update = (patch: Partial<State> | ((s: State) => State)) => void;
const PORTAL = "https://readytalent2.singaporetech.edu.sg/";
const TAB_LABEL: Record<Tab, string> = { jobs: "ReadyTalent", search: "Search", saved: "Saved", applied: "Applied", resume: "Resume", settings: "Settings" };
const SOURCE_LABEL = { linkedin: "LinkedIn", indeed: "Indeed", pasted: "Pasted" } as const;
const sourceOf = (j: Job) => (j.source ? SOURCE_LABEL[j.source] : "ReadyTalent");

/** Every AI action goes through this: nothing calls the AI without a click, and the user is told it costs tokens. */
function aiConfirm(s: State, what: string): boolean {
  if (s.warnTokens === false) return true;
  const cfg = aiCfg(s);
  const model = cfg.model || PROVIDERS[cfg.provider].defaultModel;
  return window.confirm(`${what}\n\nThis sends data to ${PROVIDERS[cfg.provider].label} (${model}) and consumes API tokens, which may cost money.\n\nContinue?`);
}

/** Skill choices from ATS keywords: confirmed skills that this job asks for are added; "leave out" skills are removed everywhere. */
const skillPrefs = (s: State, jobId: string): SkillPrefs => {
  const kw = new Set((s.keywords[jobId] || []).map((k) => k.toLowerCase()));
  return { include: (s.knownSkills || []).filter((k) => kw.has(k.toLowerCase())), omit: s.omitSkills || [] };
};

export default function App() {
  const [state, update, ready] = useAppState();
  const [tab, setTab] = useState<Tab>("jobs");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [boardJobs, setBoardJobs] = useState<Job[]>([]);
  const [sel, setSelMap] = useState<Partial<Record<Tab, Job | null>>>({});
  const [doc, setDoc] = useState<{ kind: "resume" | "letter"; jobId: string }>({ kind: "resume", jobId: "" });
  useEffect(() => { fetchJobs().then(setJobs); fetchBoardJobs().then(setBoardJobs); }, []);
  const allJobs = useMemo(() => [...jobs, ...(state.pasted || []), ...boardJobs], [jobs, boardJobs, state.pasted]);
  if (!ready) return null;
  const open = (kind: "resume" | "letter", jobId: string) => { setDoc({ kind, jobId }); setTab("resume"); };
  const selFor = (t: Tab) => ({ sel: sel[t] || null, setSel: (j: Job | null) => setSelMap((m) => ({ ...m, [t]: j })) });
  const common = { state, update, open };
  const savedJobs = allJobs.filter((j) => state.saved.includes(j.id));
  const appliedJobs = allJobs.filter((j) => state.applied?.[j.id]);
  return (
    <div className="layout">
      <nav className="tabs app-chrome">
        <span className="brand">AutoResume</span>
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>
            {TAB_LABEL[t]}{t === "saved" && savedJobs.length ? ` (${savedJobs.length})` : ""}{t === "applied" && appliedJobs.length ? ` (${appliedJobs.length})` : ""}
          </button>
        ))}
      </nav>
      <main>
        {tab === "jobs" && <Jobs mode="rt" jobs={jobs} setJobs={setJobs} {...common} {...selFor("jobs")} />}
        {tab === "search" && <SearchPage boardJobs={boardJobs} setBoardJobs={setBoardJobs} {...common} {...selFor("search")} />}
        {tab === "saved" && <Jobs mode="saved" jobs={savedJobs} {...common} {...selFor("saved")} />}
        {tab === "applied" && <Jobs mode="applied" jobs={appliedJobs} {...common} {...selFor("applied")} />}
        {tab === "resume" && <ResumeTab state={state} update={update} jobs={allJobs} doc={doc} setDoc={setDoc} />}
        {tab === "settings" && <Settings state={state} update={update} />}
      </main>
    </div>
  );
}

/* ---------------- Jobs ---------------- */

function Jobs({ mode, jobs, setJobs, state, update, sel, setSel, open, header }: {
  mode: ListMode; jobs: Job[]; setJobs?: (j: Job[]) => void; state: State; update: Update; sel: Job | null; setSel: (j: Job | null) => void;
  open: (kind: "resume" | "letter", jobId: string) => void; header?: React.ReactNode;
}) {
  const rt = mode === "rt";
  const [src, setSrc] = useState("");
  const [emp, setEmp] = useState("");
  const [work, setWork] = useState("");
  const [lvl, setLvl] = useState("");
  const [company, setCompany] = useState("");
  const empOf = (j: Job) => j.employment || (j.source ? "" : j.type);
  const distinct = (f: (j: Job) => string | undefined) => [...new Set(jobs.flatMap((j) => (f(j) || "").split(/\s*,\s*/)).filter(Boolean))].sort();
  const [q, setQ] = useState("");
  const [onlySaved, setOnlySaved] = useState(false);
  const [appliedFilter, setAppliedFilter] = useState<"" | "applied" | "open">("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<Meta>(DEFAULT_META);
  useEffect(() => { fetchMeta().then(setMeta); }, []);
  const { employmentType: type, course } = state;
  // Portal dropdown values first (exact copy of the website), plus anything seen in scraped jobs.
  const options = (fromMeta: string[], fromJobs: string[]) => [...new Set([...fromMeta, ...fromJobs.filter(Boolean).sort()])];
  const types = useMemo(() => options(meta.employmentTypes, jobs.map((j) => j.type)), [meta, jobs]);
  const courses = useMemo(() => options(meta.programmes, jobs.flatMap((j) => j.programmes || [])), [meta, jobs]);
  const [sort, setSort] = useState<"posted" | "deadline" | "salary" | "title" | "company" | "applied" | "nearest">(mode === "applied" ? "applied" : "posted");
  const [hideExpired, setHideExpired] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [minPay, setMinPay] = useState("");
  const [payListed, setPayListed] = useState(false);
  const pay = Number(minPay) > 0 ? String(Number(minPay)) : payListed ? "shown" : "";
  // Proximity: coordinates for your place and for each job address (looked up on demand, cached by the laptop app).
  const near = { ...defaultState.near, ...(state.near || {}) };
  const [nearDraft, setNearDraft] = useState(near.place);
  const [origin, setOrigin] = useState<LatLon | null>(null);
  const [coords, setCoords] = useState<Record<string, LatLon | null>>({});
  const [geoStatus, setGeoStatus] = useState("");
  const region = state.boardSearch?.location || "Singapore";
  const distOf = (j: Job) => { const c = origin && coords[placeQuery(j.location)]; return origin && c ? distanceKm(origin, c) : null; };
  const locate = async (place: string) => {
    update((s) => ({ ...s, near: { ...near, place } }));
    if (!place.trim()) { setOrigin(null); setGeoStatus(""); return; }
    try {
      setGeoStatus(`Finding "${place}"…`);
      const o = (await geocode([place], region))[place.trim()];
      if (!o) { setOrigin(null); setGeoStatus(`Couldn't find "${place}". Try a postcode, street or MRT station.`); return; }
      setOrigin(o);
      const todo = [...new Set(jobs.map((j) => placeQuery(j.location)).filter(Boolean))].filter((q) => !(q in coords));
      const found: Record<string, LatLon | null> = {};
      for (let i = 0; i < todo.length; i += 25) {
        setGeoStatus(`Locating job addresses ${Math.min(i + 25, todo.length)} of ${todo.length}… (first time only)`);
        Object.assign(found, await geocode(todo.slice(i, i + 25), region));
        setCoords((c) => ({ ...c, ...found }));
      }
      setGeoStatus("");
    } catch (e) { setGeoStatus((e as Error).message); }
  };
  useEffect(() => { if (near.place) void locate(near.place); }, [jobs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // "$1,200 - $1,500" -> 1200; "" -> 0
  const salaryNum = monthlyPay; // monthly equivalent, so yearly/hourly pay compares fairly
  // Portal dates are d/m/yyyy; fall back to scrapedAt.
  const dmy = (s: string) => { const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); return m ? new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]).getTime() : 0; };
  const [skillQ, setSkillQ] = useState("");
  const [showSkills, setShowSkills] = useState(false);
  const { skillsWant, skillsAvoid } = state;
  // Every skill named across all scraped jobs, by frequency; display uses the first spelling seen.
  const allSkills = useMemo(() => {
    const m = new Map<string, { label: string; n: number }>();
    for (const j of jobs) for (const s of new Set(j.skills.map((x) => x.trim()).filter(Boolean))) {
      const k = s.toLowerCase(); const e = m.get(k); if (e) e.n++; else m.set(k, { label: s, n: 1 });
    }
    return [...m.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  }, [jobs]);
  const cycleSkill = (k: string) => update((s) => {
    const want = s.skillsWant.includes(k), avoid = s.skillsAvoid.includes(k);
    return { ...s, skillsWant: want ? s.skillsWant.filter((x) => x !== k) : avoid ? s.skillsWant : [...s.skillsWant, k], skillsAvoid: want ? [...s.skillsAvoid, k] : s.skillsAvoid.filter((x) => x !== k) };
  });
  /** Filters currently narrowing the list (shown on the collapsed panel's header). */
  const activeFilters = [
    origin, rt && type, rt && course, src, emp, work, lvl, company, pay, appliedFilter, onlySaved,
    skillsWant.length + skillsAvoid.length > 0, !hideExpired,
  ].filter(Boolean).length;
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = jobs.filter((j) => {
      const sk = j.skills.map((s) => s.trim().toLowerCase());
      return (!rt || !type || j.type === type) &&
      (!rt || !course || (j.programmes || []).includes(course)) &&
      (!src || sourceOf(j) === src) &&
      (!emp || (empOf(j) || "").split(/\s*,\s*/).includes(emp)) &&
      (!work || j.workplace === work) && (!lvl || j.level === lvl) &&
      (!company || j.company.toLowerCase().includes(company.trim().toLowerCase())) &&
      skillsWant.every((k) => sk.includes(k)) && !skillsAvoid.some((k) => sk.includes(k)) &&
      (!onlySaved || state.saved.includes(j.id)) &&
      (appliedFilter !== "applied" || !!state.applied?.[j.id]) && (appliedFilter !== "open" || !state.applied?.[j.id]) &&
      (!hideExpired || !j.expired) &&
      payPasses(j.salary, pay) &&
      (!origin || !(near.km > 0) || (distOf(j) ?? Infinity) <= near.km) &&
      (!needle || [j.title, j.company, j.location, j.skills.join(" "), j.description].join(" ").toLowerCase().includes(needle));
    });
    const cmp: Record<typeof sort, (a: Job, b: Job) => number> = {
      nearest: (a, b) => (distOf(a) ?? Infinity) - (distOf(b) ?? Infinity),
      posted: (a, b) => (dmy(b.posted) || Date.parse(b.posted) || Date.parse(b.scrapedAt)) - (dmy(a.posted) || Date.parse(a.posted) || Date.parse(a.scrapedAt)),
      applied: (a, b) => (state.applied?.[b.id] || "").localeCompare(state.applied?.[a.id] || ""),
      deadline: (a, b) => (dmy(a.deadline) || Infinity) - (dmy(b.deadline) || Infinity),
      salary: (a, b) => salaryNum(b.salary) - salaryNum(a.salary),
      title: (a, b) => a.title.localeCompare(b.title),
      company: (a, b) => a.company.localeCompare(b.company),
    };
    return list.sort(cmp[sort]);
  }, [jobs, q, rt, src, emp, work, lvl, company, type, course, onlySaved, appliedFilter, hideExpired, pay, sort, origin, coords, near.km, state.saved, state.applied, skillsWant, skillsAvoid]);

  useEffect(() => window.desktop?.onProgress((p) => setStatus(p.msg || `Fetching job ${p.i} of ${p.n}…`)), []);

  const scrape = async () => {
    setBusy(true); setStatus("Scraping…");
    try {
      const r = await window.desktop!.scrape();
      setJobs?.(await fetchJobs());
      setMeta(await fetchMeta());
      setStatus(`Done: ${r.added} new, ${r.total} total.`);
    } catch (e) { setStatus((e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, "")); }
    setBusy(false);
  };

  return (
    <div className={`jobs ${sel ? "has-sel" : ""}`}>
      {header}
      <aside className="list app-chrome">
        <div className="toolbar">
          {rt && (isDesktop() ? (
            <div className="row">
              <button onClick={scrape} disabled={busy}>{busy ? "Working…" : "Scrape ReadyTalent"}</button>
              <button className="ghost" onClick={() => window.desktop!.openPortal()}>Open portal</button>
            </div>
          ) : (
            <div className="small muted">Scraping runs on the laptop app. This device shows the jobs it saved.</div>
          ))}
          <div className="status">{status || `${jobs.length} ${mode === "saved" ? "saved" : mode === "applied" ? "applied" : ""} jobs`}</div>
          <input placeholder="Search title, company, location, skills…" value={q} onChange={(e) => setQ(e.target.value)} />
          <details className="filters" open={filtersOpen} onToggle={(e) => setFiltersOpen((e.target as HTMLDetailsElement).open)}>
          <summary>
            <span>Filters &amp; sort{activeFilters ? ` (${activeFilters} active)` : ""}</span>
            <span className="small muted">{shown.length} of {jobs.length}{origin ? ` · near ${near.place}` : ""}</span>
          </summary>
          <div className="filters-body">
          <div className="row near-row">
            <input placeholder="Near: postcode, street or MRT" value={nearDraft} onChange={(e) => setNearDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void locate(nearDraft); }} style={{ flex: 1, minWidth: 140 }} />
            <label className="small muted" style={{ margin: 0, display: "flex", alignItems: "center", gap: 4 }}>within
              <input type="number" min={0} step={1} inputMode="numeric" value={near.km || ""} placeholder="any" style={{ width: 64 }}
                onChange={(e) => update((s) => ({ ...s, near: { ...near, km: Math.max(0, Number(e.target.value) || 0) } }))} /> km</label>
            <button className="ghost" onClick={() => void locate(nearDraft)}>{origin ? "Update" : "Go"}</button>
            {origin && <button className="ghost" onClick={() => { setNearDraft(""); void locate(""); }}>✕</button>}
          </div>
          {(geoStatus || origin) && <div className="small muted">{geoStatus || `Distances from ${near.place}${near.km > 0 ? `; showing jobs within ${near.km} km` : ""}. Jobs without a street-level address (e.g. just "Singapore") are hidden while a distance is set.`}</div>}
          {rt ? (
            <>
              <select value={type} onChange={(e) => update({ employmentType: e.target.value })}>
                <option value="">Employment Types (all)</option>
                {types.map((t) => <option key={t}>{t}</option>)}
              </select>
              <select value={course} onChange={(e) => update({ course: e.target.value })}>
                <option value="">Programmes (all)</option>
                {courses.map((c) => <option key={c}>{c}</option>)}
              </select>
            </>
          ) : (
            <>
              <div className="row">
                <select value={src} onChange={(e) => setSrc(e.target.value)} style={{ flex: 1 }}>
                  <option value="">All sources</option>
                  {[...new Set(jobs.map(sourceOf))].sort().map((x) => <option key={x}>{x}</option>)}
                </select>
                <select value={emp} onChange={(e) => setEmp(e.target.value)} style={{ flex: 1 }}>
                  <option value="">Any job type</option>
                  {distinct(empOf).map((x) => <option key={x}>{x}</option>)}
                </select>
              </div>
              <div className="row">
                <select value={work} onChange={(e) => setWork(e.target.value)} style={{ flex: 1 }}>
                  <option value="">Any working mode</option>
                  {distinct((j) => j.workplace).map((x) => <option key={x}>{x}</option>)}
                </select>
                <select value={lvl} onChange={(e) => setLvl(e.target.value)} style={{ flex: 1 }}>
                  <option value="">Any experience level</option>
                  {distinct((j) => j.level).map((x) => <option key={x}>{x}</option>)}
                </select>
              </div>
            </>
          )}
          <input placeholder="Company contains…" value={company} onChange={(e) => setCompany(e.target.value)} />
          <div className="row">
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} style={{ flex: "1 1 150px" }}>
              <option value="posted">Newest first</option>
              {origin && <option value="nearest">Nearest first</option>}
              <option value="deadline">Closing soonest</option>
              <option value="salary">Salary: high to low</option>
              <option value="title">Title A–Z</option>
              <option value="company">Company A–Z</option>
              {mode === "applied" && <option value="applied">Recently applied</option>}
            </select>
            {mode !== "applied" && <select value={appliedFilter} onChange={(e) => setAppliedFilter(e.target.value as typeof appliedFilter)} style={{ flex: "1 1 130px", width: "auto" }}>
              <option value="">All ({Object.keys(state.applied || {}).length} applied)</option>
              <option value="open">Not applied</option>
              <option value="applied">Applied</option>
            </select>}
            <input type="number" min={0} step={100} inputMode="numeric" placeholder="Min pay $/mo" value={minPay} onChange={(e) => setMinPay(e.target.value)} style={{ flex: "1 1 120px" }} title="Pay is compared per month (yearly ÷ 12, hourly × 173)" />
            <label className="small muted" style={{ margin: 0, display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={payListed} onChange={(e) => setPayListed(e.target.checked)} style={{ width: "auto" }} />pay listed</label>
          </div>
          <div className="row">
            <label className="small muted" style={{ margin: 0, flex: 1 }}><input type="checkbox" checked={hideExpired} onChange={(e) => setHideExpired(e.target.checked)} style={{ width: "auto", marginRight: 6 }} />Hide delisted · {shown.length} of {jobs.length}</label>
            <button className="ghost" onClick={() => setShowSkills(!showSkills)}>Skills{skillsWant.length + skillsAvoid.length ? ` (${skillsWant.length + skillsAvoid.length})` : ""}</button>
            {(activeFilters || q) ? <button className="ghost" onClick={() => { update(rt ? { employmentType: "", course: "", skillsWant: [], skillsAvoid: [] } : { skillsWant: [], skillsAvoid: [] }); setQ(""); setMinPay(""); setPayListed(false); setSrc(""); setEmp(""); setWork(""); setLvl(""); setCompany(""); setAppliedFilter(""); setOnlySaved(false); setHideExpired(true); if (origin) { setNearDraft(""); void locate(""); } }}>Clear</button> : null}
          </div>
          {showSkills && (
            <div className="skills-panel">
              <div className="small muted">Click a skill: once = want (green), twice = don&apos;t want (red), again = clear.</div>
              <input placeholder="Find a skill…" value={skillQ} onChange={(e) => setSkillQ(e.target.value)} />
              <div className="chips">
                {allSkills.filter((s) => !skillQ || s.label.toLowerCase().includes(skillQ.toLowerCase())).slice(0, 120).map((s) => (
                  <button key={s.key} className={`chip ${skillsWant.includes(s.key) ? "hit" : skillsAvoid.includes(s.key) ? "miss" : ""}`} onClick={() => cycleSkill(s.key)} title={`${s.n} job${s.n === 1 ? "" : "s"}`}>
                    {skillsWant.includes(s.key) ? "✓ " : skillsAvoid.includes(s.key) ? "✕ " : ""}{s.label} <span className="muted">{s.n}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {mode !== "saved" && (
            <div className="row">
              <button className={`ghost ${onlySaved ? "on" : ""}`} onClick={() => setOnlySaved(!onlySaved)}>{onlySaved ? "♥ Saved" : "♡ Saved"}</button>
            </div>
          )}
          </div>
          </details>
          {!filtersOpen && geoStatus && <div className="small muted">{geoStatus}</div>}
        </div>
        {shown.map((j) => (
          <div key={j.id} className={`job-row ${sel?.id === j.id ? "on" : ""}`} onClick={() => setSel(j)}>
            <div className="t">{state.applied?.[j.id] ? <span className="applied-tag">✓ Applied</span> : null}{state.saved.includes(j.id) ? "♥ " : ""}{j.title}</div>
            <div className="m">{j.company}</div>
            <div className="m">{[!rt ? sourceOf(j) : "", j.workplace, j.type, j.salary, j.expired ? "expired" : "", mode === "applied" && state.applied?.[j.id] ? `applied ${new Date(state.applied[j.id]).toLocaleDateString("en-SG", { day: "numeric", month: "short" })}` : "", distOf(j) !== null ? `📍 ${formatKm(distOf(j)!)}` : ""].filter(Boolean).join(" · ")}</div>
          </div>
        ))}
        {!shown.length && <div className="empty">{jobs.length ? "No matches." : { rt: "No jobs yet. Save your ReadyTalent sign-in in Settings, then Scrape.", boards: "No results yet. Pick search terms above and press Search.", saved: "Nothing saved yet. Use ♡ Save on any job.", applied: "No applications yet. Use \"Mark applied\" on a job you applied for." }[mode]}</div>}
      </aside>
      {sel ? <Detail job={sel} state={state} update={update} back={() => setSel(null)} open={open} /> : (
        <div className="empty app-chrome">Pick a job to see its description, required skills and salary, then generate a tailored resume or cover letter.</div>
      )}
    </div>
  );
}

function Detail({ job, state, update, back, open }: { job: Job; state: State; update: Update; back: () => void; open: (kind: "resume" | "letter", jobId: string) => void }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState("");
  const keywords = state.keywords[job.id];
  const mine = new Set(state.profile.skills.map((s) => s.toLowerCase()));
  const saved = state.saved.includes(job.id);
  const appliedOn = state.applied?.[job.id] || "";
  const match = keywords ? matchKeywords(keywords, profileText(state.tailored[job.id] || state.profile)) : null;

  const [done, setDone] = useState("");
  const known = new Set((state.knownSkills || []).map((k) => k.toLowerCase()));
  const omit = new Set((state.omitSkills || []).map((k) => k.toLowerCase()));
  /** Keyword chip: neutral -> "I have this" -> "leave out" -> neutral. */
  const cycleKeyword = (k: string) => update((s) => {
    const lk = k.toLowerCase();
    const drop = (list: string[] = []) => list.filter((x) => x.toLowerCase() !== lk);
    if ((s.knownSkills || []).some((x) => x.toLowerCase() === lk)) return { ...s, knownSkills: drop(s.knownSkills), omitSkills: [...drop(s.omitSkills), k] };
    if ((s.omitSkills || []).some((x) => x.toLowerCase() === lk)) return { ...s, omitSkills: drop(s.omitSkills) };
    return { ...s, knownSkills: [...drop(s.knownSkills), k] };
  });
  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name); setStatus(""); setDone("");
    try { await fn(); } catch (e) { setStatus((e as Error).message); }
    setBusy("");
  };
  const getKeywords = async (force = false) => {
    if (keywords && !force) return keywords;
    const k = await extractKeywords(aiCfg(state), job, sourceText(state.profile, state.about || ""));
    update((s) => ({ ...s, keywords: { ...s.keywords, [job.id]: k } }));
    return k;
  };

  return (
    <article className="detail">
      <div className="app-chrome">
        <button className="ghost back" onClick={back}>← Jobs</button>
        <h1>{job.title}</h1>
        <div>{job.company}{job.website && <> · <a href={job.website} target="_blank" rel="noreferrer">website</a></>}</div>
        <div className="meta">
          {job.source && <span>{sourceOf(job)}</span>}
          {job.type && <span>{job.type}</span>}
          {job.workplace && <span>🏢 {job.workplace}</span>}
          {job.programmes && job.programmes.length > 0 && <span title={job.programmes.join("\n")}>🎓 {job.programmes.length === 1 ? job.programmes[0] : `${job.programmes.length} programmes`}</span>}
          {job.salary && <span>💲 {job.salary}</span>}
          {job.location && <span>📍 {job.location}</span>}
          {job.deadline && <span>Closes {job.deadline}</span>}
          {job.vacancies && <span>{job.vacancies} vacanc{job.vacancies === "1" ? "y" : "ies"}</span>}
          {job.expired && <span style={{ color: "var(--warn)" }}>No longer listed</span>}
        </div>
        <div className="actions">
          <button className="ghost" onClick={() => update({ saved: saved ? state.saved.filter((i) => i !== job.id) : [...state.saved, job.id] })}>{saved ? "♥ Saved" : "♡ Save"}</button>
          <button className={appliedOn ? "" : "ghost"} title={appliedOn ? "Click to undo" : "Mark this job as applied"} onClick={() => update((s) => { const a = { ...(s.applied || {}) }; if (a[job.id]) delete a[job.id]; else a[job.id] = new Date().toISOString(); return { ...s, applied: a }; })}>
            {appliedOn ? `✓ Applied ${new Date(appliedOn).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}` : "Mark applied"}
          </button>
          <button className="ghost" title="Uses AI tokens" onClick={() => { if (aiConfirm(state, keywords ? "Refresh the ATS keywords for this job?" : "Extract ATS keywords for this job?")) void run("kw", async () => { await getKeywords(true); }); }} disabled={!!busy}>✦ {keywords ? "Refresh keywords" : "ATS keywords"}</button>
          <button title="Uses AI tokens" onClick={() => aiConfirm(state, `${state.tailored[job.id] ? "Re-tailor" : "Tailor"} your resume for this job?${keywords ? "" : " (also extracts ATS keywords)"} Runs a draft and a fact-check pass.`) && run("resume", async () => { const k = await getKeywords(); const t = await tailorResume(aiCfg(state), state.profile, job, k, state.about || "", skillPrefs(state, job.id)); update((s) => ({ ...s, tailored: { ...s.tailored, [job.id]: t }, generatedAt: { ...(s.generatedAt || {}), [`resume:${job.id}`]: new Date().toISOString() } })); setDone("Tailored resume ready. Use View resume to see it."); })} disabled={!!busy}>
            ✦ {busy === "resume" ? "Tailoring…" : state.tailored[job.id] ? "Re-tailor resume" : "Tailor resume"}
          </button>
          {state.tailored[job.id] && <button className="ghost" onClick={() => open("resume", job.id)}>View resume</button>}
          {stamp(state, "resume", job.id) && <span className="small muted">Tailored {stamp(state, "resume", job.id)}</span>}
          <button title="Uses AI tokens" onClick={() => aiConfirm(state, `${state.covers[job.id] ? "Rewrite" : "Write"} a cover letter for this job?${keywords ? "" : " (also extracts ATS keywords)"} Runs a draft and a fact-check pass.`) && run("letter", async () => { const k = await getKeywords(); const c = await coverLetter(aiCfg(state), state.profile, job, k, state.about || "", state.tailored[job.id], skillPrefs(state, job.id)); update((s) => ({ ...s, covers: { ...s.covers, [job.id]: c }, generatedAt: { ...(s.generatedAt || {}), [`letter:${job.id}`]: new Date().toISOString() } })); setDone("Cover letter ready. Use View letter to see it."); })} disabled={!!busy}>
            ✦ {busy === "letter" ? "Writing…" : state.covers[job.id] ? "Rewrite cover letter" : "Cover letter"}
          </button>
          {state.covers[job.id] && <button className="ghost" onClick={() => open("letter", job.id)}>View letter</button>}
          {stamp(state, "letter", job.id) && <span className="small muted">Written {stamp(state, "letter", job.id)}</span>}
          {job.source === "pasted"
            ? <>
                {job.url && <a className="small" href={job.url} target="_blank" rel="noreferrer">Open posting ↗</a>}
                <button className="ghost small" onClick={() => { if (confirm(`Delete the pasted posting "${job.title}"? Its tailored resume and letter stay.`)) { update((s) => ({ ...s, pasted: (s.pasted || []).filter((j) => j.id !== job.id), saved: s.saved.filter((i) => i !== job.id) })); back(); } }}>Delete posting</button>
              </>
            : job.source
            ? <a className="small" href={job.url} target="_blank" rel="noreferrer">Open on {sourceOf(job)} ↗</a>
            : <a className="small" href={PORTAL} target="_blank" rel="noreferrer" onClick={(e) => { if (isDesktop()) { e.preventDefault(); window.desktop!.openPortal(); } }}>Apply on ReadyTalent ↗</a>}
        </div>
        <div className={`status ${status ? "err" : ""}`} style={done && !status ? { color: "var(--ok)" } : undefined}>{status || (busy === "kw" ? "Extracting keywords…" : busy === "resume" ? "Tailoring and fact-checking your resume…" : busy === "letter" ? "Writing and fact-checking your cover letter…" : done)}</div>
        {job.source === "indeed" && <div className="small muted">Indeed only shares a summary with apps; tailoring uses this summary and the listed requirements. Open the posting for the full description.</div>}

        {match && (
          <>
            <h3>ATS keyword match · {Math.round((match.hit.length / Math.max(1, keywords!.length)) * 100)}% of {keywords!.length}</h3>
            <div className="chips">
              {[...match.hit, ...match.miss].map((k) => {
                const lk = k.toLowerCase();
                const mark = known.has(lk) ? "have" : omit.has(lk) ? "omit" : "";
                return (
                  <button key={k} className={`chip ${match.hit.includes(k) ? "hit" : "miss"} ${mark ? `mark-${mark}` : ""}`} onClick={() => cycleKeyword(k)}
                    title={mark === "have" ? "You have this: tailoring adds it. Click to leave it out." : mark === "omit" ? "Left out of your resume. Click to clear." : "Click if you have this skill, click again to leave it out."}>
                    {mark === "have" ? "✓ " : mark === "omit" ? "✕ " : ""}{k}
                  </button>
                );
              })}
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>Green = already in your {state.tailored[job.id] ? "tailored" : ""} resume. Orange = missing. Click a keyword once for "I have this" (tailoring adds it), twice for "leave out" (tailoring removes it), again to clear. Choices apply to every job; then press {state.tailored[job.id] ? "Re-tailor" : "Tailor"} resume.</div>
          </>
        )}

        {job.skills.length > 0 && (
          <>
            <h3>Skills needed</h3>
            <div className="chips">{job.skills.map((s, i) => <span key={i} className={`chip ${mine.has(s.toLowerCase()) ? "hit" : ""}`}>{s}</span>)}</div>
          </>
        )}
        {job.description && <><h3>Job description</h3><pre>{job.description}</pre></>}
        {job.requirements && <><h3>Requirements</h3><pre>{job.requirements}</pre></>}
        {job.companyProfile && <><h3>About {job.company}</h3><pre>{job.companyProfile}</pre></>}
        <div className="small muted" style={{ marginTop: 24 }}>Posted {job.posted || "?"} · scraped {new Date(job.scrapedAt).toLocaleString()}</div>
      </div>
    </article>
  );
}

/* ---------------- Search (LinkedIn / Indeed) ---------------- */

/** Chip list with an inline "add" box. */
function ChipInput({ items, onAdd, onRemove, placeholder }: { items: string[]; onAdd: (v: string) => void; onRemove: (v: string) => void; placeholder: string }) {
  const [v, setV] = useState("");
  const add = () => { const t = v.trim(); if (t) onAdd(t); setV(""); };
  return (
    <div className="chips">
      {items.map((it) => <span key={it} className="chip">{it} <button className="chip-x" onClick={() => onRemove(it)} title="Remove">×</button></span>)}
      <input className="chip-input" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} onBlur={add} />
    </div>
  );
}

/**
 * LinkedIn / Indeed search. The AI suggests roles and writes search terms, but nothing is scraped
 * until the user presses Search, and only the ticked terms are searched.
 */
function SearchPage({ boardJobs, setBoardJobs, state, update, sel, setSel, open }: {
  boardJobs: Job[]; setBoardJobs: (j: Job[]) => void; state: State; update: Update; sel: Job | null; setSel: (j: Job | null) => void;
  open: (kind: "resume" | "letter", jobId: string) => void;
}) {
  const [busy, setBusy] = useState<"" | "roles" | "terms" | "search">("");
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");
  const opts = { ...defaultState.boardSearch, ...state.boardSearch };
  const setOpts = (patch: Partial<State["boardSearch"]>) => update((s) => ({ ...s, boardSearch: { ...defaultState.boardSearch, ...s.boardSearch, ...patch } }));
  const toggle = (key: "jobTypes" | "workplace" | "levels", v: string) => setOpts({ [key]: opts[key].includes(v) ? opts[key].filter((x) => x !== v) : [...opts[key], v] });
  /** Add one or more terms ("project manager, technical sales"), ticked, skipping duplicates. */
  const addTerms = (raw: string) => update((s) => {
    const have = new Set((s.searchTerms || []).map((x) => x.term.toLowerCase()));
    const add = raw.split(/[,;\n]+/).map((t) => t.trim()).filter((t) => t && !have.has(t.toLowerCase()) && have.add(t.toLowerCase()));
    return { ...s, searchTerms: [...(s.searchTerms || []), ...add.map((term) => ({ term, on: true }))] };
  });
  const [termDraft, setTermDraft] = useState("");
  const interests = state.interests || [];
  const terms = state.searchTerms || [];
  const onTerms = terms.filter((t) => t.on).map((t) => t.term);
  const source = () => sourceText(state.profile, state.about || "");
  const hasKey = !!aiCfg(state).key;

  const ai = async (kind: "roles" | "terms", fn: () => Promise<void>) => {
    setBusy(kind); setErr("");
    try { await fn(); } catch (e) { setErr((e as Error).message); }
    setBusy("");
  };
  const suggest = () => ai("roles", async () => {
    const roles = await suggestRoles(aiCfg(state), source(), interests);
    update({ roleSuggestions: roles });
  });
  const genTerms = (roles = interests) => ai("terms", async () => {
    const add = await generateSearchTerms(aiCfg(state), source(), roles, terms.map((t) => t.term));
    update((s) => ({ ...s, searchTerms: [...(s.searchTerms || []), ...add.map((term) => ({ term, on: true }))] }));
  });
  useEffect(() => window.desktop?.onBoardsProgress((p) => setStatus(p.msg)), []);

  const addInterest = (r: string) => {
    if (interests.some((x) => x.toLowerCase() === r.toLowerCase())) return;
    const next = [...interests, r];
    update((s) => ({ ...s, interests: next, roleSuggestions: (s.roleSuggestions || []).filter((x) => x.toLowerCase() !== r.toLowerCase()) }));
    addTerms(r); // the role itself is a search term straight away
  };
  const search = async () => {
    setBusy("search"); setErr(""); setStatus("Starting search…");
    try {
      const r = await window.desktop!.searchBoards({ ...opts, terms: onTerms });
      setBoardJobs(await fetchBoardJobs());
      setStatus(`Done: ${r.found} jobs seen, ${r.added} new, ${r.total} stored.`);
      if (r.errors.length) setErr(r.errors.join(" "));
    } catch (e) { setErr((e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, "")); setStatus(""); }
    setBusy("");
  };

  const panel = (
    <details className="search-panel app-chrome">
      <summary>Search LinkedIn and Indeed{onTerms.length ? ` · ${onTerms.length} terms ticked` : ""}{busy === "search" && status ? ` · ${status}` : ""}{!busy && err ? " · last search had problems (open for details)" : ""}</summary>
      <label>Roles you are interested in (press Enter to add; each one is also added as a search term)</label>
      <ChipInput items={interests} placeholder="e.g. Project Manager, Technical Sales" onAdd={(v) => v.split(/[,;]+/).map((x) => x.trim()).filter(Boolean).forEach(addInterest)} onRemove={(r) => update({ interests: interests.filter((x) => x !== r) })} />
      <div className="row" style={{ marginTop: 6 }}>
        <span className="small muted">AI suggestions from your resume{(state.roleSuggestions || []).length ? "" : " (press Suggest roles)"}:</span>
        {(state.roleSuggestions || []).map((r) => <button key={r} className="chip" onClick={() => addInterest(r)} title="Add to your roles">+ {r}</button>)}
        <button className="ghost small" title="Uses AI tokens" disabled={!hasKey || !!busy} onClick={() => { if (aiConfirm(state, "Ask the AI to suggest roles from your resume?")) void suggest(); }}>✦ {busy === "roles" ? "Thinking…" : (state.roleSuggestions || []).length ? "Suggest again" : "Suggest roles"}</button>
      </div>

      <label>Search terms (click to tick or untick; only ticked terms are searched)</label>
      <div className="chips">
        {terms.map((t) => (
          <span key={t.term} className={`chip term ${t.on ? "hit" : ""}`}>
            <button className="chip-toggle" onClick={() => update((s) => ({ ...s, searchTerms: s.searchTerms.map((x) => (x.term === t.term ? { ...x, on: !x.on } : x)) }))}>{t.on ? "✓ " : ""}{t.term}</button>
            <button className="chip-x" onClick={() => update((s) => ({ ...s, searchTerms: s.searchTerms.filter((x) => x.term !== t.term) }))} title="Remove">×</button>
          </span>
        ))}
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <input value={termDraft} placeholder="Type your own search terms, e.g. project manager, technical sales" onChange={(e) => setTermDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && termDraft.trim()) { addTerms(termDraft); setTermDraft(""); } }} style={{ flex: 1, minWidth: 220 }} />
        <button className="ghost" disabled={!termDraft.trim()} onClick={() => { addTerms(termDraft); setTermDraft(""); }}>Add term</button>
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <button className="ghost small" title="Uses AI tokens" disabled={!hasKey || !!busy} onClick={() => { if (aiConfirm(state, "Ask the AI to write search terms from your roles and resume?")) void genTerms(); }}>✦ {busy === "terms" ? "Writing terms…" : terms.length ? "Generate more terms from my roles" : "Generate terms from my roles"}</button>
        {terms.length > 0 && <button className="ghost small" onClick={() => update((s) => ({ ...s, searchTerms: s.searchTerms.map((x) => ({ ...x, on: !onTerms.length })) }))}>{onTerms.length ? "Untick all" : "Tick all"}</button>}
        {!hasKey && <span className="small muted">Add an AI key in Settings for suggestions; you can still type roles and terms.</span>}
      </div>

      <div className="row search-opts">
        <label>Location <input value={opts.location} onChange={(e) => setOpts({ location: e.target.value })} style={{ width: 140 }} /></label>
        <label><input type="checkbox" checked={opts.linkedin} onChange={(e) => setOpts({ linkedin: e.target.checked })} /> LinkedIn</label>
        <label><input type="checkbox" checked={opts.indeed} onChange={(e) => setOpts({ indeed: e.target.checked })} /> Indeed</label>
        <label>Results per term
          <select value={opts.perTerm} onChange={(e) => setOpts({ perTerm: Number(e.target.value) })}>{[5, 10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </label>
        <label>Posted within
          <select value={opts.days} onChange={(e) => setOpts({ days: Number(e.target.value) })}>{[1, 3, 7, 14, 30].map((n) => <option key={n} value={n}>{n === 1 ? "24 hours" : `${n} days`}</option>)}</select>
        </label>
      </div>
      <div className="filter-groups">
        {([
          ["jobTypes", "Employment type", { fulltime: "Full-time", parttime: "Part-time", contract: "Contract", temporary: "Temporary", internship: "Internship" }],
          ["workplace", "Workplace", { onsite: "On-site", remote: "Remote", hybrid: "Hybrid" }],
          ["levels", "Experience level", { internship: "Internship", entry: "Entry level", associate: "Associate", mid: "Mid-Senior", director: "Director", executive: "Executive" }],
        ] as const).map(([key, title, labels]) => (
          <div key={key} className="filter-group">
            <span className="small muted">{title}{opts[key].length ? "" : " (any)"}</span>
            {Object.entries(labels).map(([v, label]) => (
              <button key={v} className={`chip ${opts[key].includes(v) ? "hit" : ""}`} onClick={() => toggle(key, v)}>{opts[key].includes(v) ? "✓ " : ""}{label}</button>
            ))}
          </div>
        ))}
        <div className="filter-group">
          <label className="small muted" style={{ margin: 0 }}>Only these companies <input value={opts.companyInclude} placeholder="e.g. Google, Shopee" onChange={(e) => setOpts({ companyInclude: e.target.value })} /></label>
          <label className="small muted" style={{ margin: 0 }}>Skip these companies <input value={opts.companyExclude} placeholder="e.g. agency names" onChange={(e) => setOpts({ companyExclude: e.target.value })} /></label>
        </div>
        <div className="small muted">LinkedIn applies all of these. Indeed applies one employment type, remote-only and one level itself; the rest are filtered from its results.</div>
      </div>
      {isDesktop() ? (
        <div className="row">
          <button disabled={busy === "search" || !onTerms.length || (!opts.linkedin && !opts.indeed)} onClick={search}>{busy === "search" ? "Searching…" : `Search ${onTerms.length} term${onTerms.length === 1 ? "" : "s"}`}</button>
          {busy === "search" && <button className="ghost" onClick={() => window.desktop!.stopBoards()}>Stop</button>}
          <button className="ghost small" onClick={() => window.desktop!.showBoardWindow()} title="Shows the hidden browser window, e.g. to complete an Indeed verification yourself">Open Indeed window</button>
          {boardJobs.length > 0 && <button className="ghost small" disabled={!!busy} onClick={async () => { if (confirm(`Delete all ${boardJobs.length} stored LinkedIn/Indeed results? Saved, applied and tailored items stay.`)) { await window.desktop!.removeBoardJobs("all"); setBoardJobs([]); setSel(null); } }}>Clear results</button>}
        </div>
      ) : <div className="small muted">Searching runs on the laptop app. This device shows the stored results.</div>}
      <div className="status">{status}</div>
      {err && <div className="status err">{err}</div>}
    </details>
  );
  return (
    <div className="search-page">
      <Jobs mode="boards" jobs={[...(state.pasted || []), ...boardJobs]} state={state} update={update} sel={sel} setSel={setSel} open={open} header={<>{panel}<PastePosting state={state} update={update} onAdded={setSel} /></>} />
    </div>
  );
}

/* ---------------- Resume / cover letter (A4) ---------------- */

function ResumeTab({ state, update, jobs, doc, setDoc }: {
  state: State; update: Update; jobs: Job[]; doc: { kind: "resume" | "letter"; jobId: string }; setDoc: (d: { kind: "resume" | "letter"; jobId: string }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState<FitInfo | null>(null);
  useEffect(() => {
    const fit = () => setZoom(Math.min(1, ((ref.current?.clientWidth || 800) - 16) / 794));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  const label = (id: string) => { const j = jobs.find((x) => x.id === id); return j ? `${j.title} — ${j.company}` : id; };
  // The header always comes from your current details, so every tailored version (old or new) shows them.
  const { name, email, phone, location, portfolio, linkedin, github, links } = state.profile;
  const tailoredVersion = doc.kind === "resume" && doc.jobId ? state.tailored[doc.jobId] : undefined;
  const profile = tailoredVersion ? { ...tailoredVersion, name, email, phone, location, portfolio, linkedin, github, links } : state.profile;
  const [editing, setEditing] = useState(false);
  /** Edits go straight into the version being viewed: the tailored copy, or your base details. */
  const editVersion = (patch: Partial<Profile>) => update((s) => (tailoredVersion
    ? { ...s, tailored: { ...s.tailored, [doc.jobId]: { ...s.tailored[doc.jobId], ...patch } }, generatedAt: { ...(s.generatedAt || {}), [`edited:${doc.jobId}`]: new Date().toISOString() } }
    : { ...s, profile: { ...s.profile, ...patch } }));
  const letter = doc.kind === "letter" ? state.covers[doc.jobId] || "" : "";
  const fileName = `${state.profile.name || "resume"} - ${doc.kind === "letter" ? "cover letter" : "resume"}${doc.jobId ? " - " + label(doc.jobId).replace(/[\\/:*?"<>|]/g, "") : ""}`;
  const value = `${doc.kind}:${doc.jobId}`;
  return (
    <div className="resume-tab">
      <div className="toolbar app-chrome">
        <select value={value} onChange={(e) => { const [kind, jobId] = e.target.value.split(/:(.*)/); setDoc({ kind: kind as "resume" | "letter", jobId }); }}>
          <option value="resume:">Base resume</option>
          {Object.keys(state.tailored).map((id) => <option key={id} value={`resume:${id}`}>Resume · {label(id)}{stamp(state, "resume", id) ? ` · ${stamp(state, "resume", id)}` : ""}</option>)}
          {Object.keys(state.covers).map((id) => <option key={id} value={`letter:${id}`}>Cover letter · {label(id)}{stamp(state, "letter", id) ? ` · ${stamp(state, "letter", id)}` : ""}</option>)}
        </select>
        <select value={state.template} onChange={(e) => update({ template: e.target.value as Template })}>
          <option value="standard">Standard</option>
          <option value="classic">Classic</option>
          <option value="modern">Modern</option>
          <option value="compact">Compact</option>
        </select>
        {isDesktop()
          ? <button onClick={() => window.desktop!.savePdf(fileName)}>Save PDF (A4)</button>
          : <button onClick={() => window.print()}>Print / Save PDF (A4)</button>}
        {doc.kind === "resume" && <button className={editing ? "" : "ghost"} onClick={() => setEditing(!editing)}>{editing ? "Done editing" : tailoredVersion ? "Edit this version" : "Edit"}</button>}
        {doc.jobId && doc.kind === "resume" && <button className="ghost" onClick={() => { const t = { ...state.tailored }; delete t[doc.jobId]; update({ tailored: t }); setDoc({ kind: "resume", jobId: "" }); }}>Delete this version</button>}
        <span className="small muted">{Math.round(zoom * 100)}%</span>
        {fit && (
          <span className={`small fit-note ${fit.hiddenBullets || !fit.fits ? "warn" : "muted"}`} title={`Every resume and letter is one A4 page; text is never smaller than ${MIN_FONT_PT} pt`}>
            {[
              "One A4 page",
              `smallest text ${fit.smallestPt.toFixed(1)} pt`,
              fit.scale < 0.999 ? `shrunk to ${Math.round(fit.scale * 100)}%` : "",
              fit.tight ? "tighter spacing" : "",
              fit.hiddenBullets ? `${fit.hiddenBullets} bullet point${fit.hiddenBullets === 1 ? "" : "s"} left off to fit; choose what shows with Edit, or tailor to a job` : "",
              !fit.fits ? "still too long: shorten it with Edit" : "",
            ].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>
      {doc.kind === "letter" && (
        <div className="app-chrome" style={{ padding: "8px 16px", borderBottom: "1px solid var(--line)" }}>
          <textarea value={letter} rows={6} onChange={(e) => update((s) => ({ ...s, covers: { ...s.covers, [doc.jobId]: e.target.value } }))} placeholder="Cover letter text (editable)" />
        </div>
      )}
      {editing && doc.kind === "resume" && (
        <div className="resume-editor app-chrome">
          <div className="small muted">{tailoredVersion ? "Editing only this tailored version; changes save as you type and the preview updates live. No AI is used." : "Editing your base details (same as Settings)."} Header details come from Settings.</div>
          <ProfileBody p={profile} setP={editVersion} />
        </div>
      )}
      <div className="preview" ref={ref}>
        <div className="preview-zoom" style={{ zoom }}>
          {doc.kind === "letter"
            ? <LetterPage p={state.profile} text={letter} template={state.template} onFit={setFit} />
            : <ResumePage p={profile} template={state.template} onFit={setFit} />}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Settings ---------------- */

function Settings({ state, update }: { state: State; update: Update }) {
  const p = state.profile;
  const setP = (patch: Partial<Profile>) => update({ profile: { ...p, ...patch } });
  const [lan, setLan] = useState<string[]>([]);
  const [meta, setMeta] = useState<Meta>(DEFAULT_META);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const [ranking, setRanking] = useState("");
  const rank = async () => {
    setRanking("Ranking…");
    try {
      const apply = await rankProfile(aiCfg(state), p, state.interests || [], state.about || "");
      update((s) => ({ ...s, profile: apply(s.profile) }));
      setRanking("Ranked. The page shows the top of each list; nothing was removed.");
    } catch (e) { setRanking(`Ranking failed: ${(e as Error).message}`); }
  };
  useEffect(() => {
    fetchMeta().then(setMeta);
    if (isDesktop()) fetch("/api/info").then((r) => r.json()).then((i) => setLan(i.lan || [])).catch(() => undefined);
  }, []);
  const field = (key: keyof Profile, label: string, ph = "") => (
    <div><label>{label}</label><input value={p[key] as string} placeholder={ph} onChange={(e) => setP({ [key]: e.target.value })} /></div>
  );
  return (
    <div className="settings app-chrome">
      <h2>AI</h2>
      <label>Provider used for keywords, resumes, cover letters and resume import</label>
      <select value={state.provider} onChange={(e) => update({ provider: e.target.value as Provider })}>
        {(Object.keys(PROVIDERS) as Provider[]).map((p) => <option key={p} value={p}>{PROVIDERS[p].label}{state[KEY_OF[p]] ? "" : " (no key)"}</option>)}
      </select>
      <ModelPicker state={state} update={update} />
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={state.warnTokens !== false} onChange={(e) => update({ warnTokens: e.target.checked })} /> Ask before every AI action (✦). AI actions consume API tokens; nothing runs without your click.</label>
      <div className="small muted">API keys are stored only on this device / your laptop.</div>
      {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
        <div key={p}>
          <label>{PROVIDERS[p].label} API key · <a href={PROVIDERS[p].keyUrl} target="_blank" rel="noreferrer">get key</a></label>
          <input type="password" value={state[KEY_OF[p]]} placeholder={PROVIDERS[p].placeholder} onChange={(e) => update({ [KEY_OF[p]]: e.target.value })} autoComplete="off" />
        </div>
      ))}

      {isDesktop() && <Credentials />}

      <h2>Job preferences</h2>
      <div className="small muted">Set these before scraping. They filter the job list and are saved between sessions.</div>
      <div className="grid2">
        <div><label>Employment type</label>
          <select value={state.employmentType} onChange={(e) => update({ employmentType: e.target.value })}>
            <option value="">All employment types</option>
            {meta.employmentTypes.map((t) => <option key={t}>{t}</option>)}
          </select></div>
        <div><label>Course / programme</label>
          <select value={state.course} onChange={(e) => update({ course: e.target.value })}>
            <option value="">All programmes</option>
            {meta.programmes.map((c) => <option key={c}>{c}</option>)}
          </select></div>
      </div>

      <h2>Your details</h2>
      <div className="small muted">Import from your current resume (PDF, photo or Markdown .md; the AI reads and OCRs it), then check the fields below.</div>
      <div className="actions">
        <label style={{ margin: 0 }}><span className="chip" style={{ cursor: "pointer" }}>{importing ? "Reading resume…" : "Upload resume (PDF / image / MD)"}</span>
          <input type="file" accept="application/pdf,image/*,.md,.markdown,.txt,text/markdown,text/plain" style={{ display: "none" }} disabled={importing} onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
            const exactTemplate = /\.(md|markdown|txt)$/i.test(f.name) && (await f.text()).trimStart().startsWith(MARKER);
            if (!exactTemplate && !aiConfirm(state, `Read "${f.name}" with the AI and replace your details with what it finds?`)) return;
            setImporting(true); setImportStatus("");
            try { const parsed = await parseResume(aiCfg(state), f); update({ profile: parsed }); setImportStatus(`Imported ${f.name}. Review the fields below.`); }
            catch (err) { setImportStatus((err as Error).message); }
            setImporting(false);
          }} />
        </label>
        <button className="ghost" onClick={() => {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([toMarkdown(p)], { type: "text/markdown" }));
          a.download = `${p.name || "resume"}.md`; a.click();
        }}>Download .md template</button>
        <span className="status">{importStatus}</span>
      </div>
      <div className="small muted">The .md template holds your current details. Edit it in any text editor and upload it back; that format imports instantly without an AI key.</div>
      <div className="grid2">
        {field("name", "Full name")}
        {field("email", "Email")}
        {field("phone", "Phone")}
        {field("location", "Location", "Singapore")}
      </div>
      <div className="grid2">
        {field("portfolio", "Portfolio / website", "https://yourname.com")}
        {field("linkedin", "LinkedIn", "https://www.linkedin.com/in/you/")}
        {field("github", "GitHub", "https://github.com/you")}
        {field("links", "Other links (optional)", "e.g. https://yourblog.com · https://dribbble.com/you")}
      </div>
      <div className="small muted">The resume header shows phone • email • portfolio • LinkedIn • GitHub, all clickable in the PDF.</div>
      <div className="row" style={{ marginTop: 16, alignItems: "center" }}>
        <button className="ghost" title="Uses AI tokens" disabled={ranking === "Ranking…"} onClick={() => { if (aiConfirm(state, `Rank your projects, sections and skills by relevance to ${(state.interests || []).length ? "the roles you want (Search tab)" : "the roles your resume fits"}? Only the order changes.`)) void rank(); }}>✦ Rank by relevance</button>
        <span className="small muted">{ranking || "Everything stays stored; resumes show the top of each list."}</span>
      </div>
      <ProfileBody p={p} setP={setP} />
      <label>More about you, for the AI only (languages such as Mandarin / Chinese, soft skills, achievements). Resumes and letters may only state facts from your resume and this box.</label>
      <textarea value={state.about || ""} rows={4} placeholder={"e.g. Fluent in English and Mandarin (Chinese). Strong at teamwork, communication and problem solving."} onChange={(e) => update({ about: e.target.value })} />

      {isDesktop() && (
        <>
          <h2>Tablet access</h2>
          <div className="small muted">On the same Wi-Fi, open one of these in the tablet browser, then use "Add to Home Screen". Your details and jobs sync from this laptop while the app is running.</div>
          <ul>{lan.map((u) => <li key={u}><code>{u}</code></li>)}</ul>
        </>
      )}
      <h2>Data</h2>
      <div className="small muted">Everything is saved locally: on this device (browser storage) and in the laptop app's data folder. Nothing is uploaded except the prompts sent to Gemini.</div>
      <div className="actions">
        <button className="ghost" onClick={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" })); a.download = "autoresume-backup.json"; a.click(); }}>Export backup</button>
        <label style={{ margin: 0 }}><span className="chip" style={{ cursor: "pointer" }}>Import backup</span>
          <input type="file" accept="application/json" style={{ display: "none" }} onChange={async (e) => { const f = e.target.files?.[0]; if (f) update(JSON.parse(await f.text())); }} />
        </label>
      </div>
    </div>
  );
}

/** ReadyTalent sign-in, stored encrypted on this laptop only (Windows DPAPI). Used by Scrape to sign in without opening the website. */
function Credentials() {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [savedUser, setSavedUser] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => { window.desktop!.getCreds().then((c) => { setSavedUser(c.user); setUser(c.user); }); }, []);
  const save = async (clear = false) => {
    try {
      const r = await window.desktop!.setCreds(clear ? "" : user.trim(), clear ? "" : pass);
      setSavedUser(r.user); setPass(""); setStatus(r.user ? `Saved. Scrape will sign in as ${r.user}.` : "Cleared.");
    } catch (e) { setStatus((e as Error).message); }
  };
  return (
    <>
      <h2>ReadyTalent sign-in</h2>
      <div className="small muted">Your SIT login, e.g. <code>2301234@sit.singaporetech.edu.sg</code>. Kept encrypted on this laptop, never sent to the tablet. Scrape signs in for you each session.</div>
      <div className="grid2">
        <div><label>Username</label><input value={user} placeholder="studentid@sit.singaporetech.edu.sg" autoComplete="off" onChange={(e) => setUser(e.target.value)} /></div>
        <div><label>Password</label><input type="password" value={pass} placeholder={savedUser ? "•••••••• (saved)" : ""} autoComplete="new-password" onChange={(e) => setPass(e.target.value)} /></div>
      </div>
      <div className="actions">
        <button onClick={() => save()} disabled={!user.trim() || !pass}>Save sign-in</button>
        {savedUser && <button className="ghost" onClick={() => save(true)}>Clear</button>}
        <span className="status">{status || (savedUser ? `Saved for ${savedUser}` : "Not saved")}</span>
      </div>
    </>
  );
}

/**
 * Model picker: every model the current key can see (provider's own models endpoint), with
 * list prices per 1M tokens (OpenRouter's public price list) and an on-demand availability check.
 */
function ModelPicker({ state, update }: { state: State; update: Update }) {
  const provider = state.provider;
  const key = state[KEY_OF[provider]];
  const picked = state.models?.[provider] || "";
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [prices, setPrices] = useState<Map<string, Price>>(new Map());
  const [health, setHealth] = useState<Record<string, { ok: boolean; ms: number; note: string } | "checking">>({});
  const [status, setStatus] = useState("");
  const [showAll, setShowAll] = useState(false);
  const load = async () => {
    setHealth({});
    if (!key) { setModels([]); setStatus("Add this provider's API key below to list its models."); return; }
    setStatus("Loading models…");
    try {
      const [m, p] = await Promise.all([listModels(provider, key), priceTable()]);
      setModels(m); setPrices(p);
      setStatus(`${m.filter((x) => x.usable).length} text models (${m.length} total) for this key.`);
    } catch (e) { setModels([]); setStatus((e as Error).message); }
  };
  useEffect(() => { void load(); }, [provider, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const setPick = (id: string) => update((s) => ({ ...s, models: { ...s.models, [provider]: id } }));
  const money = (n: number) => (n === 0 ? "free" : n < 0.1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`);
  const priceText = (id: string) => { const p = priceFor(provider, id, prices); return p ? `${money(p.input)} in / ${money(p.output)} out` : "price n/a"; };
  const healthText = (id: string) => { const h = health[id]; return !h ? "" : h === "checking" ? "checking…" : h.ok ? `✓ online ${h.ms}ms` : `✕ ${h.note}`; };
  const check = async (ids: string[]) => {
    setHealth((h) => ({ ...h, ...Object.fromEntries(ids.map((id) => [id, "checking" as const])) }));
    let next = 0;
    const worker = async () => {
      while (next < ids.length) {
        const id = ids[next++];
        const r = await pingModel({ provider, key, model: id });
        setHealth((h) => ({ ...h, [id]: r }));
      }
    };
    await Promise.all(Array.from({ length: 5 }, worker)); // 5 at a time
  };
  const usable = models.filter((m) => m.usable);
  const other = models.filter((m) => !m.usable);
  const savedMissing = picked && !models.some((m) => m.id === picked);
  const optionText = (m: ModelInfo) => [m.label, priceText(m.id), healthText(m.id)].filter(Boolean).join("  ·  ");
  return (
    <>
      <label>Model (prices are USD per 1M tokens)</label>
      <div className="row">
        <select value={picked} onChange={(e) => setPick(e.target.value)} style={{ flex: 1 }}>
          <option value="">Default: {PROVIDERS[provider].defaultModel}</option>
          {savedMissing && <option value={picked}>{picked} (saved, not in list)</option>}
          {usable.length > 0 && <optgroup label="Text models">{usable.map((m) => <option key={m.id} value={m.id}>{optionText(m)}</option>)}</optgroup>}
          {other.length > 0 && <optgroup label="Other models (audio, image, embedding: will not work here)">{other.map((m) => <option key={m.id} value={m.id}>{optionText(m)}</option>)}</optgroup>}
        </select>
        <button className="ghost" onClick={() => void load()}>Refresh list</button>
        <button className="ghost" disabled={!key} title="Uses AI tokens" onClick={() => { if (aiConfirm(state, "Send one tiny test request to the selected model?")) void check([picked || usable[0]?.id].filter(Boolean) as string[]); }}>✦ Test selected</button>
      </div>
      <div className="status">{status}{picked && healthText(picked) ? ` Selected: ${healthText(picked)}` : ""}</div>
      {models.length > 0 && (
        <details open={showAll} onToggle={(e) => setShowAll((e.target as HTMLDetailsElement).open)}>
          <summary className="small">All {models.length} models, prices and availability</summary>
          <div className="actions">
            <button className="ghost" title="Uses AI tokens" onClick={() => { if (aiConfirm(state, `Send one tiny test request to each of ${usable.length} models?`)) void check(usable.map((m) => m.id)); }}>✦ Check which text models are online ({usable.length})</button>
            <span className="small muted">Sends one tiny request per model; costs a fraction of a cent in total.</span>
          </div>
          <table className="models">
            <thead><tr><th>Model</th><th>Price per 1M tokens</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id} className={m.usable ? "" : "muted"}>
                  <td>{m.label}{m.usable ? "" : " (not for text)"}</td>
                  <td>{priceText(m.id)}</td>
                  <td>{healthText(m.id) || (m.usable ? <button className="ghost small" title="Uses AI tokens" onClick={() => { if (aiConfirm(state, `Send one tiny test request to ${m.id}?`)) void check([m.id]); }}>✦ Check</button> : "")}</td>
                  <td>{m.usable && (picked === m.id ? <b>In use</b> : <button className="ghost small" onClick={() => setPick(m.id)}>Use</button>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </>
  );
}

/** Paste a job posting (its text, or a link on the laptop app) to keep it with your jobs and tailor for it. */
function PastePosting({ state, update, onAdded }: { state: State; update: Update; onAdded: (j: Job) => void }) {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const add = (job: Partial<Job>, body: string) => {
    const j: Job = {
      id: `pasted-${Date.now()}`, title: "", company: "", type: "", salary: "", location: "", skills: [], description: body.trim(), requirements: "",
      deadline: "", posted: new Date().toISOString().slice(0, 10), vacancies: "", website: "", companyProfile: "", active: true,
      scrapedAt: new Date().toISOString(), source: "pasted", url: url.trim() || undefined, ...job,
    };
    j.title = title.trim() || j.title || "Pasted job"; j.company = company.trim() || j.company;
    j.type = j.employment || "";
    update((s) => ({ ...s, pasted: [j, ...(s.pasted || [])] }));
    setText(""); setUrl(""); setTitle(""); setCompany(""); setErr("");
    onAdded(j);
  };
  const withAi = async () => {
    setErr("");
    try {
      let body = text;
      if (!body.trim() && url.trim()) { setBusy("Reading the page…"); body = await window.desktop!.pageText(url.trim()); }
      if (!body.trim()) throw new Error("Paste the posting's text (or its link on the laptop app).");
      setBusy("Reading the posting…");
      add(await readPosting(aiCfg(state), body), body);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(""); }
  };
  return (
    <details className="search-panel app-chrome">
      <summary>Paste a job posting <span className="small muted" style={{ fontWeight: 400 }}>· from any site{(state.pasted || []).length ? ` · ${(state.pasted || []).length} pasted` : ""}</span></summary>
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the whole job posting here (title, company, description, requirements…)" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={isDesktop() ? "Link to the posting (optional; with no text pasted, ✦ reads the page)" : "Link to the posting (optional)"} />
        <div className="row">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Job title (the AI fills this if blank)" style={{ flex: 1 }} />
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" style={{ flex: 1 }} />
        </div>
        <div className="row">
          <button disabled={!!busy || (!text.trim() && !(isDesktop() && url.trim()))} title="Uses AI tokens" onClick={() => { if (aiConfirm(state, "Read this job posting with the AI (title, company, pay, skills…)?")) void withAi(); }}>✦ {busy || "Add with AI"}</button>
          <button className="ghost" disabled={!!busy || !text.trim() || !title.trim()} title="Needs a job title; no AI is used" onClick={() => add({}, text)}>Add without AI</button>
        </div>
        {err && <div className="status err">{err}</div>}
      </div>
    </details>
  );
}

/** Resume content editor (summary, skills, entries, sections, awards, skill lines). Used for your details and for editing any tailored version. */
function ProfileBody({ p, setP }: { p: Profile; setP: (patch: Partial<Profile>) => void }) {
  return (
    <>
      <label>Summary</label>
      <textarea value={p.summary} onChange={(e) => setP({ summary: e.target.value })} placeholder="2-3 lines about you. The AI can rewrite this per job." />
      <label>Skills (comma separated, most relevant first)</label>
      <div className="small muted">The page shows the first {Math.min(shownCount(p, "skills", MAX_SKILLS), p.skills.filter(Boolean).length)} of {p.skills.filter(Boolean).length}; the rest stay stored here.</div>
      <textarea value={p.skills.join(", ")} onChange={(e) => setP({ skills: e.target.value.split(",").map((s) => s.trim()) })} onBlur={(e) => setP({ skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />

      <EntryList title="Experience" items={p.experience} onChange={(experience) => setP({ experience })} />
      <EntryList title="Projects" items={p.projects} shown={shownCount(p, "projects", MAX_PROJECTS)} onChange={(projects) => setP({ projects })} />
      <EntryList title="Education" items={p.education} onChange={(education) => setP({ education })} />
      {(p.sections || []).map((sec, si) => (
        <div key={si}>
          <div className="row" style={{ marginTop: 26 }}>
            <input value={sec.title} placeholder="Section title, e.g. Competition" style={{ flex: 1, fontWeight: 600 }} onChange={(e) => setP({ sections: p.sections.map((x, j) => (j === si ? { ...x, title: e.target.value } : x)) })} />
            <button className="ghost" onClick={() => setP({ sections: p.sections.filter((_, j) => j !== si) })}>Remove section</button>
          </div>
          <EntryList title={sec.title || "Entries"} items={sec.entries} shown={shownCount(p, sectionKey(sec.title), sectionLimit(sec.title))} onChange={(entries) => setP({ sections: p.sections.map((x, j) => (j === si ? { ...x, entries } : x)) })} />
        </div>
      ))}
      <div className="actions"><button className="ghost" onClick={() => setP({ sections: [...(p.sections || []), { title: "", entries: [emptyEntry()] }] })}>+ Add section (e.g. Competition, Leadership)</button></div>
      <label>Awards & certifications (one per line)</label>
      <textarea value={p.awards.join("\n")} onChange={(e) => setP({ awards: e.target.value.split("\n") })} onBlur={(e) => setP({ awards: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
      <label>Other skill lines, one per line (e.g. "Soft Skills: Analytical Thinking | Communication", "Interests: Data Analytics")</label>
      <textarea value={(p.additional || []).join("\n")} onChange={(e) => setP({ additional: e.target.value.split("\n") })} onBlur={(e) => setP({ additional: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
    </>
  );
}

function EntryList({ title, items, shown = Infinity, onChange }: { title: string; items: Entry[]; shown?: number; onChange: (e: Entry[]) => void }) {
  const set = (i: number, patch: Partial<Entry>) => onChange(items.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  return (
    <>
      <h2>{title} <button className="ghost small" style={{ marginLeft: 8 }} onClick={() => onChange([...items, emptyEntry()])}>+ Add</button></h2>
      {(title === "Projects" || isLeadership(title) || shown < items.length) && <div className="small muted">Ranked, most relevant first: the page shows the top {Math.min(shown, items.length)} (use ↑ to reorder); everything below stays stored.</div>}
      {items.map((e, i) => (
        <div className={`card${i >= shown ? " stored" : ""}`} key={i} title={i >= shown ? "Stored, not on the page" : undefined}>
          <div className="row">
            <input placeholder={title === "Education" ? "Degree" : "Role / project name"} value={e.title} onChange={(ev) => set(i, { title: ev.target.value })} />
            <input placeholder={title === "Projects" ? "Tech stack" : "Organisation"} value={e.org} onChange={(ev) => set(i, { org: ev.target.value })} />
            <input placeholder="Location" value={e.location || ""} onChange={(ev) => set(i, { location: ev.target.value })} />
            <input placeholder="Dates (e.g. Jan 2024 – Present)" value={e.dates} onChange={(ev) => set(i, { dates: ev.target.value })} />
            {i > 0 && <button className="ghost" title="Move up" onClick={() => onChange(items.map((x, j) => (j === i - 1 ? items[i] : j === i ? items[i - 1] : x)))}>↑</button>}
            <button className="ghost" onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>
          </div>
          <textarea placeholder="Bullet points, one per line" value={e.details.join("\n")} onChange={(ev) => set(i, { details: ev.target.value.split("\n") })} onBlur={(ev) => set(i, { details: ev.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
        </div>
      ))}
    </>
  );
}
