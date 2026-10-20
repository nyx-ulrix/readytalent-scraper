import { useEffect, useMemo, useState } from "react";
import { likeScore } from "../ground";
import { clearResults, type ClearScope, fetchMeta, geocode } from "../store";
import { toCsv } from "../csv";
import { distanceKm, formatKm, placeQuery, type LatLon } from "../geo";
import { matchKeywords } from "../ai";
import { monthlyPay, payPasses } from "../pay";
import { DEFAULT_META, defaultState, isDesktop, profileText, type Job, type Meta, type State } from "../types";
import { stamp, type Update, PORTAL, sourceOf, aiConfirm } from "../appShared";
import { confirmDelete } from "../ui/common";
import { type JobWork, taskOf, useJobTasks, jobAi, jobAiQuestion } from "../jobTasks";

export type ListMode = "all" | "targets" | "saved" | "applied";

/* ---------------- Jobs ---------------- */

export function Jobs({ mode, jobs, state, update, sel, setSel, open, header, onCleared }: {
  mode: ListMode; jobs: Job[]; state: State; update: Update; sel: Job | null; setSel: (j: Job | null) => void;
  open: (kind: "resume" | "letter", jobId: string) => void; header?: React.ReactNode; onCleared?: () => void;
}) {
  useJobTasks();
  const rt = mode === "all"; // show the ReadyTalent employment type / programme dropdowns
  /** Filters and sort are remembered for each list (ReadyTalent, Search, Saved, Applied), across restarts. */
  const kept = state.listFilters?.[mode] || {};
  const keep = <T,>(k: string, def: T): [T, (v: T) => void] =>
    [(kept[k] as T | undefined) ?? def, (v: T) => update((s) => ({ ...s, listFilters: { ...(s.listFilters || {}), [mode]: { ...(s.listFilters?.[mode] || {}), [k]: v } } }))];
  const [src, setSrc] = keep("src", "");
  const [emp, setEmp] = keep("emp", "");
  const [work, setWork] = keep("work", "");
  const [lvl, setLvl] = keep("lvl", "");
  const [company, setCompany] = keep("company", "");
  const empOf = (j: Job) => j.employment || (j.source ? "" : j.type);
  const distinct = (f: (j: Job) => string | undefined) => [...new Set(jobs.flatMap((j) => (f(j) || "").split(/\s*,\s*/)).filter(Boolean))].sort();
  const [q, setQ] = keep("q", "");
  const [onlySaved, setOnlySaved] = keep("onlySaved", false);
  const [appliedFilter, setAppliedFilter] = keep<"" | "applied" | "open" | "waiting" | "rejected">("appliedFilter", "");
  const rejectedOn = (id: string) => state.rejected?.[id];
  const [hiringFilter, setHiringFilter] = keep<"" | "hiring" | "not">("hiringFilter", "");
  const notHiring = (id: string) => !!state.notHiring?.[id];
  const [meta, setMeta] = useState<Meta>(DEFAULT_META);
  useEffect(() => { fetchMeta().then(setMeta); }, []);
  const { employmentType: type, course } = state;
  // Portal dropdown values first (exact copy of the website), plus anything seen in scraped jobs.
  const options = (fromMeta: string[], fromJobs: string[]) => [...new Set([...fromMeta, ...fromJobs.filter(Boolean).sort()])];
  const types = useMemo(() => options(meta.employmentTypes, jobs.map((j) => j.type)), [meta, jobs]);
  const courses = useMemo(() => options(meta.programmes, jobs.flatMap((j) => j.programmes || [])), [meta, jobs]);
  const [sort, setSort] = keep<"posted" | "fetched" | "deadline" | "salary" | "title" | "company" | "applied" | "nearest" | `like:${number}`>("sort", mode === "applied" ? "applied" : "posted");
  const [hideExpired, setHideExpired] = keep("hideExpired", true);
  const [showRemoved, setShowRemoved] = keep("showRemoved", false);
  const hidden = new Set(state.hidden || []);
  const hidesRemoved = mode === "all" || mode === "targets"; // Saved / Applied always show what you saved or applied to
  const removedHere = hidesRemoved ? jobs.filter((j) => hidden.has(j.id)).length : 0;
  const [filtersOpen, setFiltersOpen] = keep("filtersOpen", false);
  const [minPay, setMinPay] = keep("minPay", "");
  const [payListed, setPayListed] = keep("payListed", false);
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
    origin, rt && type, rt && course, src, emp, work, lvl, company, pay, appliedFilter, hiringFilter, onlySaved,
    skillsWant.length + skillsAvoid.length > 0, !hideExpired,
  ].filter(Boolean).length;
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = jobs.filter((j) => {
      const sk = j.skills.map((s) => s.trim().toLowerCase());
      return (!rt || !type || !!j.source || j.type === type) &&
      (!rt || !course || !!j.source || (j.programmes || []).includes(course)) &&
      (!src || sourceOf(j) === src) &&
      (!emp || (empOf(j) || "").split(/\s*,\s*/).includes(emp)) &&
      (!work || j.workplace === work) && (!lvl || j.level === lvl) &&
      (!company || j.company.toLowerCase().includes(company.trim().toLowerCase())) &&
      skillsWant.every((k) => sk.includes(k)) && !skillsAvoid.some((k) => sk.includes(k)) &&
      (!onlySaved || state.saved.includes(j.id)) &&
      (appliedFilter !== "applied" || !!state.applied?.[j.id]) && (appliedFilter !== "open" || !state.applied?.[j.id]) &&
      (appliedFilter !== "waiting" || (!!state.applied?.[j.id] && !rejectedOn(j.id))) && (appliedFilter !== "rejected" || !!rejectedOn(j.id)) &&
      (hiringFilter !== "hiring" || !notHiring(j.id)) && (hiringFilter !== "not" || notHiring(j.id)) &&
      (!hideExpired || !j.expired) &&
      (!hidesRemoved || showRemoved || !hidden.has(j.id)) &&
      payPasses(j.salary, pay) &&
      (!origin || !(near.km > 0) || (distOf(j) ?? Infinity) <= near.km) &&
      (!needle || [j.title, j.company, j.location, j.skills.join(" "), j.description].join(" ").toLowerCase().includes(needle));
    });
    const target = sort.startsWith("like:") ? (state.targets || [])[Number(sort.slice(5))] : undefined;
    if (target) {
      const score = new Map(list.map((j) => [j.id, likeScore(j, target)]));
      return list.sort((a, b) => (score.get(b.id) || 0) - (score.get(a.id) || 0));
    }
    const cmp: Record<string, (a: Job, b: Job) => number> = {
      nearest: (a, b) => (distOf(a) ?? Infinity) - (distOf(b) ?? Infinity),
      posted: (a, b) => (dmy(b.posted) || Date.parse(b.posted) || Date.parse(b.scrapedAt)) - (dmy(a.posted) || Date.parse(a.posted) || Date.parse(a.scrapedAt)),
      applied: (a, b) => (state.applied?.[b.id] || "").localeCompare(state.applied?.[a.id] || ""),
      // When this app last fetched the job (a later search that sees it again counts).
      fetched: (a, b) => (Date.parse(b.lastSeen || b.scrapedAt) || 0) - (Date.parse(a.lastSeen || a.scrapedAt) || 0),
      deadline: (a, b) => (dmy(a.deadline) || Infinity) - (dmy(b.deadline) || Infinity),
      salary: (a, b) => salaryNum(b.salary) - salaryNum(a.salary),
      title: (a, b) => a.title.localeCompare(b.title),
      company: (a, b) => a.company.localeCompare(b.company),
    };
    return list.sort(cmp[sort] || cmp.posted); // a remembered sort whose target was removed
  }, [jobs, q, rt, src, emp, work, lvl, company, type, course, onlySaved, appliedFilter, hideExpired, pay, sort, origin, coords, near.km, state.saved, state.applied, state.rejected, state.notHiring, hiringFilter, skillsWant, skillsAvoid, state.targets, state.hidden, showRemoved]);

  return (
    <div className={`jobs ${sel ? "has-sel" : ""}`}>
      {header}
      <aside className="list app-chrome">
        <div className="toolbar">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="status" style={{ flex: 1 }}>{`${jobs.length} ${mode === "saved" ? "saved" : mode === "applied" ? "applied" : ""} jobs`.replace(/\s+/g, " ")}{removedHere > 0 && !showRemoved ? ` · ${removedHere} removed` : ""}</div>
            <button className="ghost small" disabled={!shown.length} title="Save the jobs shown (with your current filters and sort) as a spreadsheet (CSV: opens in Excel or Google Sheets)" onClick={() => {
              const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" }) : "");
              const rows = [
                ["Title", "Company", "Source", "Location", "Salary", "Job type", "Working mode", "Level", "Posted", "Deadline", "Saved", "Applied", "Rejected", "Not hiring", "Distance (km)", "Link", "Skills", "Requirements", "Description"],
                ...shown.map((j) => [j.title, j.company, sourceOf(j), j.location, j.salary, empOf(j) || j.type, j.workplace, j.level, j.posted, j.deadline,
                  state.saved.includes(j.id) ? "Yes" : "", day(state.applied?.[j.id]), day(state.rejected?.[j.id]), day(state.notHiring?.[j.id]), distOf(j)?.toFixed(1),
                  j.url || (j.source ? "" : PORTAL), j.skills.join(", "), j.requirements, j.description]),
              ];
              const a = document.createElement("a");
              a.href = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
              a.download = `autoresume-${mode === "all" ? "jobs" : mode}-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              window.setTimeout(() => URL.revokeObjectURL(a.href), 10000);
            }}>Export {shown.length}</button>
            {mode === "all" && onCleared && (() => {
              // Kept whatever you clear: saved, applied, and jobs with a tailored resume or letter (pasted jobs are never cleared).
              const keepIds = [...new Set([...state.saved, ...Object.keys(state.applied || {}), ...Object.keys(state.rejected || {}), ...Object.keys(state.tailored || {}), ...Object.keys(state.covers || {})])];
              const scopes: [ClearScope, string, string | null][] = [["all", "All sources", null], ["readytalent", "ReadyTalent", "ReadyTalent"], ["linkedin", "LinkedIn", "LinkedIn"], ["indeed", "Indeed", "Indeed"]];
              const count = (label: string | null) => jobs.filter((j) => j.source !== "pasted" && (!label || sourceOf(j) === label) && !keepIds.includes(j.id)).length;
              const clear = async (scope: ClearScope, label: string, source: string | null) => {
                const n = count(source);
                if (!n) return;
                if (!(await confirmDelete(`Clear ${n} ${source ? `${label} ` : ""}results? Jobs you saved, applied to, pasted yourself, or made a resume or cover letter for are kept.`))) return;
                try {
                  await clearResults(keepIds, scope);
                  update((s) => ({ ...s, targets: (s.targets || []).map((t) => ({ ...t, jobs: (t.jobs || []).filter((j) => keepIds.includes(j.id) || (source !== null && sourceOf(j) !== source)) })) }));
                  setSel(null); onCleared();
                } catch (e) { alert((e as Error).message); }
              };
              return (
                <select className="clear-menu" value="" title="Delete scraped results (saved, applied and pasted jobs are kept)"
                  onChange={(e) => { const sc = scopes.find(([k]) => k === e.target.value); if (sc) void clear(sc[0], sc[1], sc[2]); }}>
                  <option value="">Clear results…</option>
                  {scopes.map(([k, label, source]) => <option key={k} value={k} disabled={!count(source)}>{label} ({count(source)})</option>)}
                </select>
              );
            })()}
          </div>
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
          {rt && (
            <>
              <select value={type} onChange={(e) => update({ employmentType: e.target.value })}>
                <option value="">ReadyTalent employment types (all)</option>
                {types.map((t) => <option key={t}>{t}</option>)}
              </select>
              <select value={course} onChange={(e) => update({ course: e.target.value })}>
                <option value="">ReadyTalent programmes (all)</option>
                {courses.map((c) => <option key={c}>{c}</option>)}
              </select>
            </>
          )}
          {(
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
              <option value="fetched">Recently fetched</option>
              {origin && <option value="nearest">Nearest first</option>}
              <option value="deadline">Closing soonest</option>
              <option value="salary">Salary: high to low</option>
              <option value="title">Title A–Z</option>
              <option value="company">Company A–Z</option>
              {mode === "applied" && <option value="applied">Recently applied</option>}
              {(state.targets || []).map((t, i) => <option key={i} value={`like:${i}`}>Most like: {t.title}</option>)}
            </select>
            <select value={appliedFilter} onChange={(e) => setAppliedFilter(e.target.value as typeof appliedFilter)} style={{ flex: "1 1 130px", width: "auto" }}>
              <option value="">{mode === "applied" ? "All applications" : `All (${Object.keys(state.applied || {}).length} applied)`}</option>
              {mode !== "applied" && <option value="open">Not applied</option>}
              {mode !== "applied" && <option value="applied">Applied</option>}
              <option value="waiting">Applied, waiting to hear</option>
              <option value="rejected">Rejected ({Object.keys(state.rejected || {}).length})</option>
            </select>
            <select value={hiringFilter} onChange={(e) => setHiringFilter(e.target.value as typeof hiringFilter)} style={{ flex: "1 1 130px", width: "auto" }} title="Jobs you marked Not currently hiring">
              <option value="">Hiring or not (all)</option>
              <option value="hiring">Currently hiring</option>
              <option value="not">Not currently hiring ({Object.keys(state.notHiring || {}).length})</option>
            </select>
            <input type="number" min={0} step={100} inputMode="numeric" placeholder="Min pay $/mo" value={minPay} onChange={(e) => setMinPay(e.target.value)} style={{ flex: "1 1 120px" }} title="Pay is compared per month (yearly ÷ 12, hourly × 173)" />
            <label className="small muted" style={{ margin: 0, display: "flex", alignItems: "center", gap: 4 }}><input type="checkbox" checked={payListed} onChange={(e) => setPayListed(e.target.checked)} style={{ width: "auto" }} />pay listed</label>
          </div>
          <div className="row">
            <label className="small muted" style={{ margin: 0, flex: 1 }}><input type="checkbox" checked={hideExpired} onChange={(e) => setHideExpired(e.target.checked)} style={{ width: "auto", marginRight: 6 }} />Hide delisted · {shown.length} of {jobs.length}</label>
            {removedHere > 0 && <label className="small muted" style={{ margin: 0 }}><input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} style={{ width: "auto", marginRight: 6 }} />Show removed ({removedHere})</label>}
            <button className="ghost" onClick={() => setShowSkills(!showSkills)}>Skills{skillsWant.length + skillsAvoid.length ? ` (${skillsWant.length + skillsAvoid.length})` : ""}</button>
            {(activeFilters || q) ? <button className="ghost" onClick={() => { update(rt ? { employmentType: "", course: "", skillsWant: [], skillsAvoid: [] } : { skillsWant: [], skillsAvoid: [] }); setQ(""); setMinPay(""); setPayListed(false); setSrc(""); setEmp(""); setWork(""); setLvl(""); setCompany(""); setAppliedFilter(""); setHiringFilter(""); setOnlySaved(false); setHideExpired(true); if (origin) { setNearDraft(""); void locate(""); } }}>Clear</button> : null}
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
          <div key={j.id} data-working={taskOf(j.id).running.length ? "1" : undefined} className={`job-row ${sel?.id === j.id ? "on" : ""}${hidden.has(j.id) ? " removed" : ""}`} onClick={() => setSel(j)}>
            {hidesRemoved && <button className="ghost small row-x" title={hidden.has(j.id) ? "Bring this job back" : "Not interested: remove from the list"} aria-label={hidden.has(j.id) ? "Restore job" : "Remove job"}
              onClick={(ev) => { ev.stopPropagation(); update((s) => { const h = new Set(s.hidden || []); if (h.has(j.id)) h.delete(j.id); else h.add(j.id); return { ...s, hidden: [...h] }; }); if (sel?.id === j.id && !hidden.has(j.id)) setSel(null); }}>{hidden.has(j.id) ? "↺" : "✕"}</button>}
            <div className="t">{taskOf(j.id).running.length ? <span className="applied-tag working-tag">✦ working</span> : null}{notHiring(j.id) ? <span className="applied-tag paused-tag">⏸ Not hiring</span> : null}{rejectedOn(j.id) ? <span className="applied-tag rejected-tag">✗ Rejected</span> : state.applied?.[j.id] ? <span className="applied-tag">✓ Applied</span> : null}{state.saved.includes(j.id) ? "♥ " : ""}{j.title}</div>
            <div className="m">{j.company}</div>
            <div className="m">{[sourceOf(j), j.workplace, j.type, j.salary, j.expired ? "expired" : "", mode === "applied" && state.applied?.[j.id] ? `applied ${new Date(state.applied[j.id]).toLocaleDateString("en-SG", { day: "numeric", month: "short" })}` : "", distOf(j) !== null ? `📍 ${formatKm(distOf(j)!)}` : ""].filter(Boolean).join(" · ")}</div>
          </div>
        ))}
        {!shown.length && <div className="empty">{jobs.length ? "No matches." : { all: "No jobs yet. Use Find jobs to scrape ReadyTalent, search LinkedIn and Indeed, or paste a posting.", targets: "No jobs for this title yet. On the Find jobs tab, open it under \"Target a specific job title\" and press Search jobs like this.", saved: "Nothing saved yet. Use ♡ Save on any job.", applied: "No applications yet. Use \"Mark applied\" on a job you applied for." }[mode]}</div>}
      </aside>
      {sel ? <Detail job={sel} state={state} update={update} back={() => setSel(null)} open={open} /> : (
        <div className="empty app-chrome">Pick a job to see its description, required skills and salary, then generate a tailored resume or cover letter.</div>
      )}
    </div>
  );
}

export function Detail({ job, state, update, back, open }: { job: Job; state: State; update: Update; back: () => void; open: (kind: "resume" | "letter", jobId: string) => void }) {
  useJobTasks();
  const task = taskOf(job.id);
  const busy = (w: JobWork) => task.running.includes(w);
  const status = task.error, done = task.done;
  const keywords = state.keywords[job.id];
  const mine = new Set(state.profile.skills.map((s) => s.toLowerCase()));
  const saved = state.saved.includes(job.id);
  const appliedOn = state.applied?.[job.id] || "";
  const match = keywords ? matchKeywords(keywords, profileText(state.tailored[job.id] || state.profile)) : null;

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
  const start = (kind: JobWork) => { if (aiConfirm(state, jobAiQuestion(kind, job, state))) void jobAi(kind, job, state, update); };

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
          <button className="ghost" title={(state.hidden || []).includes(job.id) ? "Show this job in your lists again" : "Remove this job from Jobs and Targets (Filters → Show removed brings it back)"}
            onClick={() => { const off = (state.hidden || []).includes(job.id); update((s) => ({ ...s, hidden: off ? (s.hidden || []).filter((i) => i !== job.id) : [...(s.hidden || []), job.id] })); if (!off) back(); }}>
            {(state.hidden || []).includes(job.id) ? "↺ Restore job" : "✕ Not interested"}</button>
          <button className={appliedOn ? "" : "ghost"} title={appliedOn ? "Click to undo" : "Mark this job as applied"} onClick={() => update((s) => { const a = { ...(s.applied || {}) }; const r = { ...(s.rejected || {}) }; if (a[job.id]) { delete a[job.id]; delete r[job.id]; } else a[job.id] = new Date().toISOString(); return { ...s, applied: a, rejected: r }; })}>
            {appliedOn ? `✓ Applied ${new Date(appliedOn).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}` : "Mark applied"}
          </button>
          <button className={state.rejected?.[job.id] ? "rejected-on" : "ghost"} title={state.rejected?.[job.id] ? "Click to undo" : "Mark that you were rejected from this job"}
            onClick={() => update((s) => {
              const r = { ...(s.rejected || {}) };
              if (r[job.id]) { delete r[job.id]; return { ...s, rejected: r }; }
              r[job.id] = new Date().toISOString();
              return { ...s, rejected: r, applied: s.applied?.[job.id] ? s.applied : { ...(s.applied || {}), [job.id]: r[job.id] } };
            })}>
            {state.rejected?.[job.id] ? `✗ Rejected ${new Date(state.rejected[job.id]).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}` : "Mark rejected"}
          </button>
          <button className={state.notHiring?.[job.id] ? "paused-on" : "ghost"} title={state.notHiring?.[job.id] ? "Click to undo" : "Mark that this company isn't currently hiring for this role"}
            onClick={() => update((s) => { const n = { ...(s.notHiring || {}) }; if (n[job.id]) delete n[job.id]; else n[job.id] = new Date().toISOString(); return { ...s, notHiring: n }; })}>
            {state.notHiring?.[job.id] ? `⏸ Not hiring (since ${new Date(state.notHiring[job.id]).toLocaleDateString("en-SG", { day: "numeric", month: "short" })})` : "Not currently hiring"}
          </button>
          <button className="ghost" title="Uses AI tokens" onClick={() => start("kw")} disabled={busy("kw")}>✦ {keywords ? "Refresh keywords" : "ATS keywords"}</button>
          <button title="Uses AI tokens" onClick={() => start("resume")} disabled={busy("resume")}>
            ✦ {busy("resume") ? "Tailoring…" : state.tailored[job.id] ? "Re-tailor resume" : "Tailor resume"}
          </button>
          {state.tailored[job.id] && <button className="ghost" onClick={() => open("resume", job.id)}>View resume</button>}
          {stamp(state, "resume", job.id) && <span className="small muted">Tailored {stamp(state, "resume", job.id)}</span>}
          <button title="Uses AI tokens" onClick={() => start("letter")} disabled={busy("letter")}>
            ✦ {busy("letter") ? "Writing…" : state.covers[job.id] ? "Rewrite cover letter" : "Cover letter"}
          </button>
          {state.covers[job.id] && <button className="ghost" onClick={() => open("letter", job.id)}>View letter</button>}
          {stamp(state, "letter", job.id) && <span className="small muted">Written {stamp(state, "letter", job.id)}</span>}
          {job.source === "pasted"
            ? <>
                {job.url && <a className="small" href={job.url} target="_blank" rel="noreferrer">Open posting ↗</a>}
                <button className="ghost small" onClick={async () => { if (await confirmDelete(`Delete the pasted posting "${job.title}"? Its tailored resume and letter stay.`)) { update((s) => ({ ...s, pasted: (s.pasted || []).filter((j) => j.id !== job.id), saved: s.saved.filter((i) => i !== job.id) })); back(); } }}>Delete posting</button>
              </>
            : job.source
            ? <a className="small" href={job.url} target="_blank" rel="noreferrer">Open on {sourceOf(job)} ↗</a>
            : <a className="small" href={PORTAL} target="_blank" rel="noreferrer" onClick={(e) => { if (isDesktop()) { e.preventDefault(); window.desktop!.openPortal(); } }}>Apply on ReadyTalent ↗</a>}
        </div>
        <div className={`status ${status ? "err" : ""}`} style={done && !status ? { color: "var(--ok)" } : undefined}>{status || (task.running.length ? task.running.map((w) => ({ kw: "Extracting keywords…", resume: "Tailoring and fact-checking your resume…", letter: "Writing and fact-checking your cover letter…" })[w]).join(" · ") + " You can switch to other jobs meanwhile." : done)}</div>
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
