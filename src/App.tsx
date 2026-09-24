import { useEffect, useMemo, useRef, useState } from "react";
import { fetchJobs, fetchMeta, useAppState } from "./store";
import { PROVIDERS, coverLetter, extractKeywords, matchKeywords, parseResume, tailorResume, type AiConfig, type Provider } from "./ai";

const KEY_OF: Record<Provider, "geminiKey" | "openaiKey" | "qwenKey" | "anthropicKey"> = { gemini: "geminiKey", openai: "openaiKey", qwen: "qwenKey", anthropic: "anthropicKey" };
const aiCfg = (s: State): AiConfig => ({ provider: s.provider, key: s[KEY_OF[s.provider]] });
import { LetterPage, ResumePage } from "./Resume";
import { toMarkdown } from "./markdown";
import { DEFAULT_META, emptyEntry, isDesktop, profileText, type Entry, type Job, type Meta, type Profile, type State, type Template } from "./types";

type Tab = "jobs" | "resume" | "settings";
type Update = (patch: Partial<State> | ((s: State) => State)) => void;
const PORTAL = "https://readytalent2.singaporetech.edu.sg/";

export default function App() {
  const [state, update, ready] = useAppState();
  const [tab, setTab] = useState<Tab>("jobs");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sel, setSel] = useState<Job | null>(null);
  const [doc, setDoc] = useState<{ kind: "resume" | "letter"; jobId: string }>({ kind: "resume", jobId: "" });
  useEffect(() => { fetchJobs().then(setJobs); }, []);
  if (!ready) return null;
  const open = (kind: "resume" | "letter", jobId: string) => { setDoc({ kind, jobId }); setTab("resume"); };
  return (
    <div className="layout">
      <nav className="tabs app-chrome">
        <span className="brand">AutoResume</span>
        {(["jobs", "resume", "settings"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
        ))}
      </nav>
      <main>
        {tab === "jobs" && <Jobs jobs={jobs} setJobs={setJobs} state={state} update={update} sel={sel} setSel={setSel} open={open} />}
        {tab === "resume" && <ResumeTab state={state} update={update} jobs={jobs} doc={doc} setDoc={setDoc} />}
        {tab === "settings" && <Settings state={state} update={update} />}
      </main>
    </div>
  );
}

/* ---------------- Jobs ---------------- */

function Jobs({ jobs, setJobs, state, update, sel, setSel, open }: {
  jobs: Job[]; setJobs: (j: Job[]) => void; state: State; update: Update; sel: Job | null; setSel: (j: Job | null) => void;
  open: (kind: "resume" | "letter", jobId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [onlySaved, setOnlySaved] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<Meta>(DEFAULT_META);
  useEffect(() => { fetchMeta().then(setMeta); }, []);
  const { employmentType: type, course } = state;
  // Portal dropdown values first (exact copy of the website), plus anything seen in scraped jobs.
  const options = (fromMeta: string[], fromJobs: string[]) => [...new Set([...fromMeta, ...fromJobs.filter(Boolean).sort()])];
  const types = useMemo(() => options(meta.employmentTypes, jobs.map((j) => j.type)), [meta, jobs]);
  const courses = useMemo(() => options(meta.programmes, jobs.flatMap((j) => j.programmes || [])), [meta, jobs]);
  const [sort, setSort] = useState<"posted" | "deadline" | "salary" | "title" | "company">("posted");
  const [hideExpired, setHideExpired] = useState(true);
  const [minSalary, setMinSalary] = useState("");
  // "$1,200 - $1,500" -> 1200; "" -> 0
  const salaryNum = (s: string) => Number((s.match(/\d[\d,]*/) || ["0"])[0].replace(/,/g, ""));
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
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const min = Number(minSalary) || 0;
    const list = jobs.filter((j) => {
      const sk = j.skills.map((s) => s.trim().toLowerCase());
      return (!type || j.type === type) &&
      (!course || (j.programmes || []).includes(course)) &&
      skillsWant.every((k) => sk.includes(k)) && !skillsAvoid.some((k) => sk.includes(k)) &&
      (!onlySaved || state.saved.includes(j.id)) &&
      (!hideExpired || !j.expired) &&
      (!min || salaryNum(j.salary) >= min) &&
      (!needle || [j.title, j.company, j.skills.join(" "), j.description].join(" ").toLowerCase().includes(needle));
    });
    const cmp: Record<typeof sort, (a: Job, b: Job) => number> = {
      posted: (a, b) => (dmy(b.posted) || Date.parse(b.scrapedAt)) - (dmy(a.posted) || Date.parse(a.scrapedAt)),
      deadline: (a, b) => (dmy(a.deadline) || Infinity) - (dmy(b.deadline) || Infinity),
      salary: (a, b) => salaryNum(b.salary) - salaryNum(a.salary),
      title: (a, b) => a.title.localeCompare(b.title),
      company: (a, b) => a.company.localeCompare(b.company),
    };
    return list.sort(cmp[sort]);
  }, [jobs, q, type, course, onlySaved, hideExpired, minSalary, sort, state.saved, skillsWant, skillsAvoid]);

  useEffect(() => window.desktop?.onProgress((p) => setStatus(p.msg || `Fetching job ${p.i} of ${p.n}…`)), []);

  const scrape = async () => {
    setBusy(true); setStatus("Scraping…");
    try {
      const r = await window.desktop!.scrape();
      setJobs(await fetchJobs());
      setMeta(await fetchMeta());
      setStatus(`Done: ${r.added} new, ${r.total} total.`);
    } catch (e) { setStatus((e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, "")); }
    setBusy(false);
  };

  return (
    <div className={`jobs ${sel ? "has-sel" : ""}`}>
      <aside className="list app-chrome">
        <div className="toolbar">
          {isDesktop() ? (
            <div className="row">
              <button onClick={scrape} disabled={busy}>{busy ? "Working…" : "Scrape ReadyTalent"}</button>
              <button className="ghost" onClick={() => window.desktop!.openPortal()}>Open portal</button>
            </div>
          ) : (
            <div className="small muted">Scraping runs on the laptop app. This device shows the jobs it saved.</div>
          )}
          <div className="status">{status || `${jobs.length} jobs`}</div>
          <input placeholder="Search title, company, skills…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={type} onChange={(e) => update({ employmentType: e.target.value })}>
            <option value="">Employment Types (all)</option>
            {types.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select value={course} onChange={(e) => update({ course: e.target.value })}>
            <option value="">Programmes (all)</option>
            {courses.map((c) => <option key={c}>{c}</option>)}
          </select>
          <div className="row">
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} style={{ flex: 1 }}>
              <option value="posted">Newest first</option>
              <option value="deadline">Closing soonest</option>
              <option value="salary">Salary: high to low</option>
              <option value="title">Title A–Z</option>
              <option value="company">Company A–Z</option>
            </select>
            <input type="number" inputMode="numeric" placeholder="Min $" value={minSalary} onChange={(e) => setMinSalary(e.target.value)} style={{ width: 84 }} />
          </div>
          <div className="row">
            <label className="small muted" style={{ margin: 0, flex: 1 }}><input type="checkbox" checked={hideExpired} onChange={(e) => setHideExpired(e.target.checked)} style={{ width: "auto", marginRight: 6 }} />Hide delisted · {shown.length} of {jobs.length}</label>
            <button className="ghost" onClick={() => setShowSkills(!showSkills)}>Skills{skillsWant.length + skillsAvoid.length ? ` (${skillsWant.length + skillsAvoid.length})` : ""}</button>
            {(type || course || skillsWant.length || skillsAvoid.length || q || minSalary) ? <button className="ghost" onClick={() => { update({ employmentType: "", course: "", skillsWant: [], skillsAvoid: [] }); setQ(""); setMinSalary(""); }}>Clear</button> : null}
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
          <div className="row">
            <button className={`ghost ${onlySaved ? "on" : ""}`} onClick={() => setOnlySaved(!onlySaved)}>{onlySaved ? "♥ Saved" : "♡ Saved"}</button>
          </div>
        </div>
        {shown.map((j) => (
          <div key={j.id} className={`job-row ${sel?.id === j.id ? "on" : ""}`} onClick={() => setSel(j)}>
            <div className="t">{state.saved.includes(j.id) ? "♥ " : ""}{j.title}</div>
            <div className="m">{j.company}</div>
            <div className="m">{[j.type, j.salary, j.expired ? "expired" : ""].filter(Boolean).join(" · ")}</div>
          </div>
        ))}
        {!shown.length && <div className="empty">{jobs.length ? "No matches." : "No jobs yet. Save your ReadyTalent sign-in in Settings, then Scrape."}</div>}
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
  const match = keywords ? matchKeywords(keywords, profileText(state.tailored[job.id] || state.profile)) : null;

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name); setStatus("");
    try { await fn(); } catch (e) { setStatus((e as Error).message); }
    setBusy("");
  };
  const getKeywords = async () => {
    if (keywords) return keywords;
    const k = await extractKeywords(aiCfg(state), job);
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
          {job.type && <span>{job.type}</span>}
          {job.programmes && job.programmes.length > 0 && <span title={job.programmes.join("\n")}>🎓 {job.programmes.length === 1 ? job.programmes[0] : `${job.programmes.length} programmes`}</span>}
          {job.salary && <span>💲 {job.salary}</span>}
          {job.location && <span>📍 {job.location}</span>}
          {job.deadline && <span>Closes {job.deadline}</span>}
          {job.vacancies && <span>{job.vacancies} vacanc{job.vacancies === "1" ? "y" : "ies"}</span>}
          {job.expired && <span style={{ color: "var(--warn)" }}>No longer listed</span>}
        </div>
        <div className="actions">
          <button className="ghost" onClick={() => update({ saved: saved ? state.saved.filter((i) => i !== job.id) : [...state.saved, job.id] })}>{saved ? "♥ Saved" : "♡ Save"}</button>
          <button className="ghost" onClick={() => run("kw", async () => { await getKeywords(); })} disabled={!!busy}>{keywords ? "Refresh keywords" : "ATS keywords"}</button>
          <button onClick={() => run("resume", async () => { const k = await getKeywords(); const t = await tailorResume(aiCfg(state), state.profile, job, k); update((s) => ({ ...s, tailored: { ...s.tailored, [job.id]: t } })); open("resume", job.id); })} disabled={!!busy}>
            {busy === "resume" ? "Tailoring…" : state.tailored[job.id] ? "Re-tailor resume" : "Tailor resume"}
          </button>
          {state.tailored[job.id] && <button className="ghost" onClick={() => open("resume", job.id)}>View resume</button>}
          <button onClick={() => run("letter", async () => { const k = await getKeywords(); const c = await coverLetter(aiCfg(state), state.tailored[job.id] || state.profile, job, k); update((s) => ({ ...s, covers: { ...s.covers, [job.id]: c } })); open("letter", job.id); })} disabled={!!busy}>
            {busy === "letter" ? "Writing…" : state.covers[job.id] ? "Rewrite cover letter" : "Cover letter"}
          </button>
          {state.covers[job.id] && <button className="ghost" onClick={() => open("letter", job.id)}>View letter</button>}
          <a className="small" href={PORTAL} target="_blank" rel="noreferrer" onClick={(e) => { if (isDesktop()) { e.preventDefault(); window.desktop!.openPortal(); } }}>Apply on ReadyTalent ↗</a>
        </div>
        <div className={`status ${status ? "err" : ""}`}>{status || (busy === "kw" ? "Extracting keywords…" : "")}</div>

        {match && (
          <>
            <h3>ATS keyword match · {Math.round((match.hit.length / Math.max(1, keywords!.length)) * 100)}% of {keywords!.length}</h3>
            <div className="chips">
              {match.hit.map((k) => <span key={k} className="chip hit">{k}</span>)}
              {match.miss.map((k) => <span key={k} className="chip miss">{k}</span>)}
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>Green = already in your {state.tailored[job.id] ? "tailored" : ""} resume. Orange = missing; Tailor resume weaves in the ones you genuinely have.</div>
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

/* ---------------- Resume / cover letter (A4) ---------------- */

function ResumeTab({ state, update, jobs, doc, setDoc }: {
  state: State; update: Update; jobs: Job[]; doc: { kind: "resume" | "letter"; jobId: string }; setDoc: (d: { kind: "resume" | "letter"; jobId: string }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const fit = () => setZoom(Math.min(1, ((ref.current?.clientWidth || 800) - 16) / 794));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  const label = (id: string) => { const j = jobs.find((x) => x.id === id); return j ? `${j.title} — ${j.company}` : id; };
  const profile = (doc.kind === "resume" && doc.jobId && state.tailored[doc.jobId]) || state.profile;
  const letter = doc.kind === "letter" ? state.covers[doc.jobId] || "" : "";
  const fileName = `${state.profile.name || "resume"} - ${doc.kind === "letter" ? "cover letter" : "resume"}${doc.jobId ? " - " + label(doc.jobId).replace(/[\\/:*?"<>|]/g, "") : ""}`;
  const value = `${doc.kind}:${doc.jobId}`;
  return (
    <div className="resume-tab">
      <div className="toolbar app-chrome">
        <select value={value} onChange={(e) => { const [kind, jobId] = e.target.value.split(/:(.*)/); setDoc({ kind: kind as "resume" | "letter", jobId }); }}>
          <option value="resume:">Base resume</option>
          {Object.keys(state.tailored).map((id) => <option key={id} value={`resume:${id}`}>Resume · {label(id)}</option>)}
          {Object.keys(state.covers).map((id) => <option key={id} value={`letter:${id}`}>Cover letter · {label(id)}</option>)}
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
        {doc.jobId && doc.kind === "resume" && <button className="ghost" onClick={() => { const t = { ...state.tailored }; delete t[doc.jobId]; update({ tailored: t }); setDoc({ kind: "resume", jobId: "" }); }}>Delete this version</button>}
        <span className="small muted">{Math.round(zoom * 100)}%</span>
      </div>
      {doc.kind === "letter" && (
        <div className="app-chrome" style={{ padding: "8px 16px", borderBottom: "1px solid var(--line)" }}>
          <textarea value={letter} rows={6} onChange={(e) => update((s) => ({ ...s, covers: { ...s.covers, [doc.jobId]: e.target.value } }))} placeholder="Cover letter text (editable)" />
        </div>
      )}
      <div className="preview" ref={ref}>
        <div style={{ zoom }}>
          {doc.kind === "letter"
            ? <LetterPage p={state.profile} text={letter} template={state.template} />
            : <ResumePage p={profile} template={state.template} />}
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
      {field("links", "Links", "linkedin.com/in/you · github.com/you · portfolio")}
      <label>Summary</label>
      <textarea value={p.summary} onChange={(e) => setP({ summary: e.target.value })} placeholder="2-3 lines about you. Gemini rewrites this per job." />
      <label>Skills (comma separated)</label>
      <textarea value={p.skills.join(", ")} onChange={(e) => setP({ skills: e.target.value.split(",").map((s) => s.trim()) })} onBlur={(e) => setP({ skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />

      <EntryList title="Experience" items={p.experience} onChange={(experience) => setP({ experience })} />
      <EntryList title="Projects" items={p.projects} onChange={(projects) => setP({ projects })} />
      <EntryList title="Education" items={p.education} onChange={(education) => setP({ education })} />
      {(p.sections || []).map((sec, si) => (
        <div key={si}>
          <div className="row" style={{ marginTop: 26 }}>
            <input value={sec.title} placeholder="Section title, e.g. Competition" style={{ flex: 1, fontWeight: 600 }} onChange={(e) => setP({ sections: p.sections.map((x, j) => (j === si ? { ...x, title: e.target.value } : x)) })} />
            <button className="ghost" onClick={() => setP({ sections: p.sections.filter((_, j) => j !== si) })}>Remove section</button>
          </div>
          <EntryList title={sec.title || "Entries"} items={sec.entries} onChange={(entries) => setP({ sections: p.sections.map((x, j) => (j === si ? { ...x, entries } : x)) })} />
        </div>
      ))}
      <div className="actions"><button className="ghost" onClick={() => setP({ sections: [...(p.sections || []), { title: "", entries: [emptyEntry()] }] })}>+ Add section (e.g. Competition, Leadership)</button></div>
      <label>Awards & certifications (one per line)</label>
      <textarea value={p.awards.join("\n")} onChange={(e) => setP({ awards: e.target.value.split("\n") })} onBlur={(e) => setP({ awards: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
      <label>Other skill lines, one per line (e.g. "Soft Skills: Analytical Thinking | Communication", "Interests: Data Analytics")</label>
      <textarea value={(p.additional || []).join("\n")} onChange={(e) => setP({ additional: e.target.value.split("\n") })} onBlur={(e) => setP({ additional: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />

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

function EntryList({ title, items, onChange }: { title: string; items: Entry[]; onChange: (e: Entry[]) => void }) {
  const set = (i: number, patch: Partial<Entry>) => onChange(items.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  return (
    <>
      <h2>{title} <button className="ghost small" style={{ marginLeft: 8 }} onClick={() => onChange([...items, emptyEntry()])}>+ Add</button></h2>
      {items.map((e, i) => (
        <div className="card" key={i}>
          <div className="row">
            <input placeholder={title === "Education" ? "Degree" : "Role / project name"} value={e.title} onChange={(ev) => set(i, { title: ev.target.value })} />
            <input placeholder={title === "Projects" ? "Tech stack" : "Organisation"} value={e.org} onChange={(ev) => set(i, { org: ev.target.value })} />
            <input placeholder="Location" value={e.location || ""} onChange={(ev) => set(i, { location: ev.target.value })} />
            <input placeholder="Dates (e.g. Jan 2024 – Present)" value={e.dates} onChange={(ev) => set(i, { dates: ev.target.value })} />
            <button className="ghost" onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>
          </div>
          <textarea placeholder="Bullet points, one per line" value={e.details.join("\n")} onChange={(ev) => set(i, { details: ev.target.value.split("\n") })} onBlur={(ev) => set(i, { details: ev.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
        </div>
      ))}
    </>
  );
}
