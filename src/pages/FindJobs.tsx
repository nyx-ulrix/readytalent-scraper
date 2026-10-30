import { useEffect, useState } from "react";
import { clearResults, fetchBoardJobs, fetchJobs, fetchMeta, scrapePosting } from "../store";
import { generateSearchTerms, readPosting, suggestRoles, sourceText } from "../ai";
import { DEFAULT_META, defaultState, isDesktop, type Job, type Meta, type State } from "../types";
import { aiCfg, type Update, aiConfirm, LINK } from "../appShared";
import { confirmDelete, Progress, ChipInput } from "../ui/common";

/**
 * LinkedIn / Indeed search. The AI suggests roles and writes search terms, but nothing is scraped
 * until the user presses Search, and only the ticked terms are searched.
 */
/** Find jobs: every way of getting postings in (ReadyTalent, LinkedIn / Indeed, target titles, pasted postings). Browsing is on the Jobs tab. */
export function FindPage({ jobs, setJobs, boardJobs, setBoardJobs, state, update, onView }: {
  jobs: Job[]; setJobs: (j: Job[]) => void; boardJobs: Job[]; setBoardJobs: (j: Job[]) => void; state: State; update: Update; onView: (j?: Job) => void;
}) {
  const [busy, setBusy] = useState<"" | "roles" | "terms" | "target" | "search">("");
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

  const ai = async (kind: "roles" | "terms" | "target", fn: () => Promise<void>) => {
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
  const [boardProg, setBoardProg] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => window.desktop?.onBoardsProgress((p) => { setStatus(p.msg); if (p.total) setBoardProg({ done: p.done || 0, total: p.total }); }), []);

  const addInterest = (r: string) => {
    if (interests.some((x) => x.toLowerCase() === r.toLowerCase())) return;
    const next = [...interests, r];
    update((s) => ({ ...s, interests: next, roleSuggestions: (s.roleSuggestions || []).filter((x) => x.toLowerCase() !== r.toLowerCase()) }));
    addTerms(r); // the role itself is a search term straight away
  };
  const search = async (list = onTerms) => {
    setBusy("search"); setErr(""); setStatus("Starting search…"); setBoardProg(null);
    try {
      const r = await window.desktop!.searchBoards({ ...opts, terms: list });
      const fresh = await fetchBoardJobs();
      setBoardJobs(fresh);
      setStatus(`Done: ${r.found} jobs seen, ${r.added} new, ${r.total} stored.`);
      if (r.errors.length) setErr(r.errors.join(" "));
    } catch (e) { setErr((e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, "")); setStatus(""); }
    setBusy("");
  };

  const panel = (
    <section className="find-section">
      <h2>LinkedIn and Indeed <span className="small muted" style={{ fontWeight: 400 }}>· {boardJobs.length} results stored{onTerms.length ? ` · ${onTerms.length} terms ticked` : ""}</span></h2>
      <label>Roles you are interested in (press Enter to add; each one is also added as a search term)</label>
      <ChipInput items={interests} placeholder="e.g. Project Manager, Technical Sales" onAdd={(v) => v.split(/[,;]+/).map((x) => x.trim()).filter(Boolean).forEach(addInterest)} onRemove={(r) => update({ interests: interests.filter((x) => x !== r) })} />
      <div className="row" style={{ marginTop: 6 }}>
        <span className="small muted">AI suggestions from your resume{(state.roleSuggestions || []).length ? "" : " (press Suggest roles)"}:</span>
        {(state.roleSuggestions || []).map((r) => <button key={r} className="chip" onClick={() => addInterest(r)} title="Add to your roles">+ {r}</button>)}
        <button className="ghost small" title="Uses AI tokens" disabled={!hasKey || !!busy} onClick={() => { if (aiConfirm(state, "Ask the AI to suggest roles from your resume?")) void suggest(); }}>✦ {busy === "roles" ? "Thinking…" : (state.roleSuggestions || []).length ? "Suggest again" : "Suggest roles"}</button>
      </div>

      <div className="small muted" style={{ marginTop: 10 }}>Looking for one specific job title? Use the <b>Targets</b> tab: the AI writes an example posting and searches for jobs like it.</div>

      <label>Search terms (click to tick or untick; only ticked terms are searched)</label>
      {([[true, "Ticked (searched)"], [false, "Unticked"]] as const).map(([on, label]) => {
        const group = terms.filter((t) => t.on === on);
        return (
          <details key={label} className="term-group">
            <summary>{label} <span className="small muted">({group.length})</span></summary>
            <div className="chips">
              {group.map((t) => (
                <span key={t.term} className={`chip term ${t.on ? "hit" : ""}`}>
                  <button className="chip-toggle" title={t.on ? "Untick" : "Tick"} onClick={() => update((s) => ({ ...s, searchTerms: s.searchTerms.map((x) => (x.term === t.term ? { ...x, on: !x.on } : x)) }))}>{t.on ? "✓ " : ""}{t.term}</button>
                  <button className="chip-x" onClick={() => update((s) => ({ ...s, searchTerms: s.searchTerms.filter((x) => x.term !== t.term) }))} title="Remove">×</button>
                </span>
              ))}
              {!group.length && <span className="small muted">None.</span>}
            </div>
          </details>
        );
      })}
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
      {busy === "search" && <Progress done={boardProg?.done} total={boardProg?.total} label="Searches" expectMs={60000} />}
      {isDesktop() ? (
        <div className="row">
          <button disabled={busy === "search" || !onTerms.length || (!opts.linkedin && !opts.indeed)} onClick={() => void search()}>{busy === "search" ? "Searching…" : `Search ${onTerms.length} term${onTerms.length === 1 ? "" : "s"}`}</button>
          {busy === "search" && <button className="ghost" onClick={() => window.desktop!.stopBoards()}>Stop</button>}
          <button className="ghost small" onClick={() => window.desktop!.showBoardWindow()} title="Shows the hidden browser window, e.g. to complete an Indeed verification yourself">Open Indeed window</button>
          {boardJobs.length > 0 && <button className="ghost small" disabled={!!busy} onClick={async () => {
            const keepIds = [...new Set([...state.saved, ...Object.keys(state.applied || {}), ...Object.keys(state.rejected || {}), ...Object.keys(state.tailored || {}), ...Object.keys(state.covers || {})])];
            if (await confirmDelete(`Delete the stored LinkedIn/Indeed results? Jobs you saved, applied to or made a resume or letter for are kept.`)) { await clearResults(keepIds, "boards"); setBoardJobs(await fetchBoardJobs()); }
          }}>Clear results</button>}
        </div>
      ) : <div className="small muted">Searching runs on the laptop app. This device shows the stored results.</div>}
      <div className="status">{status}{!busy && /^Done/.test(status) && <> <button className="ghost small" onClick={() => onView()}>View in Jobs</button></>}</div>
      {err && <div className="status err">{err}</div>}
    </section>
  );
  return (
    <div className="find-page app-chrome">
      <ReadyTalentScrape jobs={jobs} setJobs={setJobs} state={state} update={update} onView={onView} />
      {panel}
      <PastePosting state={state} update={update} onView={onView} />
    </div>
  );
}

/** Scrape ReadyTalent (laptop app), with the employment type / programme you want to see in Jobs. */
export function ReadyTalentScrape({ jobs, setJobs, state, update, onView }: { jobs: Job[]; setJobs: (j: Job[]) => void; state: State; update: Update; onView: (j?: Job) => void }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [prog, setProg] = useState<{ i: number; n: number } | null>(null);
  const [meta, setMeta] = useState<Meta>(DEFAULT_META);
  useEffect(() => { fetchMeta().then(setMeta); }, []);
  useEffect(() => window.desktop?.onProgress((p) => { setProg(p.n ? { i: p.i, n: p.n } : null); setStatus(p.msg || `Fetching job ${p.i} of ${p.n}…`); }), []);
  const options = (fromMeta: string[], fromJobs: string[]) => [...new Set([...fromMeta, ...fromJobs.filter(Boolean).sort()])];
  const types = options(meta.employmentTypes, jobs.map((j) => j.type));
  const courses = options(meta.programmes, jobs.flatMap((j) => j.programmes || []));
  const scrape = async () => {
    setBusy(true); setStatus("Scraping…");
    try {
      const r = await window.desktop!.scrape();
      setJobs(await fetchJobs());
      setMeta(await fetchMeta());
      const marked = [r.markedApplied ? `${r.markedApplied} marked applied` : "", r.markedRejected ? `${r.markedRejected} marked rejected` : ""].filter(Boolean).join(", ");
      setStatus(`Done: ${r.added} new, ${r.total} total.${r.applications !== undefined ? ` ${r.applications} applications on ReadyTalent${marked ? `: ${marked}` : ", all marked already"}.` : ""}`);
      // The server wrote the marks into your saved state; fetch it now rather than at the next 30 s refresh.
      if (marked) window.dispatchEvent(new Event("focus"));
    } catch (e) { setStatus((e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, "")); }
    setBusy(false); setProg(null);
  };
  return (
    <section className="find-section">
      <h2>ReadyTalent <span className="small muted" style={{ fontWeight: 400 }}>· {jobs.length} jobs stored</span></h2>
      <div className="small muted">Show these in Jobs (saved between sessions):</div>
      <div className="row">
        <select value={state.employmentType} onChange={(e) => update({ employmentType: e.target.value })} style={{ flex: 1 }}>
          <option value="">Employment types (all)</option>
          {types.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select value={state.course} onChange={(e) => update({ course: e.target.value })} style={{ flex: 1 }}>
          <option value="">Programmes (all)</option>
          {courses.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      {busy && (prog ? <Progress done={prog.i} total={prog.n} label="Jobs fetched" /> : <Progress label="Signing in and listing jobs" expectMs={20000} />)}
      {isDesktop() ? (
        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={scrape} disabled={busy}>{busy ? "Scraping…" : "Scrape ReadyTalent"}</button>
          <button className="ghost" onClick={() => window.desktop!.openPortal()}>Open portal</button>
        </div>
      ) : <div className="small muted">Scraping runs on the laptop app. This device shows the jobs it saved.</div>}
      <div className="status">{status}{!busy && /^Done/.test(status) && <> <button className="ghost small" onClick={() => onView()}>View in Jobs</button></>}</div>
    </section>
  );
}

/**
 * Paste a job posting to keep it with your jobs and tailor for it. A link is read and saved straight away
 * (no AI); pasted text can be read with the AI or saved as it is with a title you type.
 */
export function PastePosting({ state, update, onView }: { state: State; update: Update; onView: (j?: Job) => void }) {
  const [last, setLast] = useState<Job | null>(null);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  /** Save (a link read twice replaces its earlier copy) and open it. */
  const save = (j: Job) => {
    update((s) => ({ ...s, pasted: [j, ...(s.pasted || []).filter((x) => x.id !== j.id)] }));
    setText(""); setTitle(""); setCompany(""); setErr("");
    setLast(j);
  };
  const fromText = (job: Partial<Job>, body: string) => {
    const j: Job = {
      id: `pasted-${Date.now()}`, title: "", company: "", type: "", salary: "", location: "", skills: [], description: body.trim(), requirements: "",
      deadline: "", posted: new Date().toISOString().slice(0, 10), vacancies: "", website: "", companyProfile: "", active: true,
      scrapedAt: new Date().toISOString(), source: "pasted", ...job,
    };
    j.title = title.trim() || j.title || "Pasted job"; j.company = company.trim() || j.company;
    j.type = j.employment || "";
    save(j);
    setNote(`Saved "${j.title}".`);
  };
  const fromLink = async (link: string) => {
    setErr(""); setNote(""); setBusy("Reading the link…");
    try {
      const j = await scrapePosting(link);
      save(j);
      setNote(`Saved "${j.title}"${j.company ? ` at ${j.company}` : ""}.`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(""); }
  };
  const withAi = async () => {
    setErr(""); setNote(""); setBusy("Reading the posting…");
    try { fromText(await readPosting(aiCfg(state), text), text); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(""); }
  };
  const isLink = LINK.test(text.trim());
  return (
    <section className="find-section">
      <h2>Paste a job posting <span className="small muted" style={{ fontWeight: 400 }}>· from any site{(state.pasted || []).length ? ` · ${(state.pasted || []).length} pasted` : ""}</span></h2>
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        <textarea rows={5} value={text} disabled={!!busy} placeholder="Paste a link to a job posting (saved straight away, no AI), or the posting's whole text"
          onChange={(e) => { setText(e.target.value); setNote(""); }}
          onPaste={(e) => { const t = e.clipboardData.getData("text").trim(); if (LINK.test(t) && !text.trim()) { e.preventDefault(); setText(t); void fromLink(t); } }} />
        {isLink ? (
          <div className="row">
            <button className="ghost" disabled={!!busy} onClick={() => void fromLink(text.trim())}>{busy || "Read link again"}</button>
          </div>
        ) : text.trim() ? (
          <>
            <div className="row">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Job title (the AI fills this if blank)" style={{ flex: 1 }} />
              <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" style={{ flex: 1 }} />
            </div>
            <div className="row">
              <button disabled={!!busy} title="Uses AI tokens" onClick={() => { if (aiConfirm(state, "Read this job posting with the AI (title, company, pay, skills…)?")) void withAi(); }}>✦ {busy || "Add with AI"}</button>
              <button className="ghost" disabled={!!busy || !title.trim()} title="Needs a job title; no AI is used" onClick={() => fromText({}, text)}>Add without AI</button>
            </div>
          </>
        ) : null}
        {busy && <Progress label={busy.replace(/…$/, "")} expectMs={busy.startsWith("Reading the link") ? 6000 : 12000} />}
        {note && <div className="status" style={{ color: "var(--ok)" }}>{note}{last && <> <button className="ghost small" onClick={() => onView(last)}>View in Jobs</button></>}</div>}
        {err && <div className="status err">{err}</div>}
      </div>
    </section>
  );
}
