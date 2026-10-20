import { useEffect, useState } from "react";
import { fetchBoardJobs } from "../store";
import { targetRole } from "../ai";
import { defaultState, isDesktop, type Job, type State } from "../types";
import { aiCfg, type Update, aiConfirm } from "../appShared";
import { confirmDelete, Progress } from "../ui/common";
import { Jobs } from "./Jobs";

/**
 * Targets: type a specific job title, the AI writes a typical posting and targeted search terms, "Search jobs like
 * this" searches LinkedIn / Indeed for them, and the jobs found are kept (with full details) under that title.
 */
export function TargetsPage({ state, update, sel, setSel, open, setBoardJobs }: {
  state: State; update: Update; sel: Job | null; setSel: (j: Job | null) => void; open: (kind: "resume" | "letter", jobId: string) => void; setBoardJobs: (j: Job[]) => void;
}) {
  const targets = state.targets || [];
  const [pick, setPick] = useState(targets[0]?.title || "");
  const t = targets.find((x) => x.title === pick) || targets[0];
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"" | "write" | "search">("");
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");
  const hasKey = !!aiCfg(state).key;
  const opts = { ...defaultState.boardSearch, ...state.boardSearch };
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  useEffect(() => (busy === "search" ? window.desktop?.onBoardsProgress((p) => { setStatus(p.msg); if (p.total) setProg({ done: p.done || 0, total: p.total }); }) : undefined), [busy]);
  const write = async (title: string) => {
    if (!aiConfirm(state, `Write an example posting and search terms for "${title}"?`)) return;
    setBusy("write"); setErr(""); setStatus("");
    try {
      const made = await targetRole(aiCfg(state), title, opts.location);
      update((s) => ({ ...s, targets: [{ title, ...made, at: new Date().toISOString(), jobs: (s.targets || []).find((x) => x.title.toLowerCase() === title.toLowerCase())?.jobs || [] }, ...(s.targets || []).filter((x) => x.title.toLowerCase() !== title.toLowerCase())] }));
      setPick(title); setDraft("");
    } catch (e) { setErr((e as Error).message); }
    setBusy("");
  };
  const search = async () => {
    if (!t) return;
    setBusy("search"); setErr(""); setStatus("Starting search…"); setProg(null);
    try {
      const r = await window.desktop!.searchBoards({ ...opts, terms: t.terms });
      const fresh = await fetchBoardJobs();
      setBoardJobs(fresh);
      const ids = r.ids || [];
      const hits = fresh.filter((j) => ids.includes(j.id));
      update((s) => ({ ...s, targets: (s.targets || []).map((x) => (x.title !== t.title ? x : { ...x, jobs: [...hits, ...(x.jobs || []).filter((j) => !ids.includes(j.id))] })) }));
      setStatus(`Done: ${hits.length} jobs found for "${t.title}".`);
      if (r.errors.length) setErr(r.errors.join(" "));
    } catch (e) { setErr((e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, "")); setStatus(""); }
    setBusy("");
  };
  /** Add this title's terms (ticked) to the search terms on Find jobs. */
  const addTerms = () => update((s) => {
    const have = new Set((s.searchTerms || []).map((x) => x.term.toLowerCase()));
    return { ...s, searchTerms: [...(s.searchTerms || []), ...t!.terms.filter((y) => !have.has(y.toLowerCase())).map((term) => ({ term, on: true }))] };
  });
  const header = (
    <div className="search-panel app-chrome">
      <div className="row">
        <input value={draft} placeholder="Type a specific job title, e.g. Forward Deployed Engineer" onChange={(e) => setDraft(e.target.value)} style={{ flex: 1, minWidth: 220 }}
          onKeyDown={(e) => { if (e.key === "Enter" && draft.trim() && hasKey && !busy) void write(draft.trim()); }} />
        <button disabled={!hasKey || !!busy || !draft.trim()} title="Uses AI tokens" onClick={() => void write(draft.trim())}>✦ {busy === "write" ? "Writing…" : "Generate posting"}</button>
      </div>
      {!hasKey && <div className="small muted">Add an AI key in Settings to generate postings.</div>}
      {targets.length > 0 && t && (
        <>
          <div className="row" style={{ marginTop: 8, alignItems: "center" }}>
            <b>Job title</b>
            <select value={t.title} onChange={(e) => { setPick(e.target.value); setSel(null); setStatus(""); }} style={{ flex: 1, minWidth: 200 }}>
              {targets.map((x) => <option key={x.title} value={x.title}>{x.title} ({(x.jobs || []).length} jobs)</option>)}
            </select>
          </div>
          <details className="target">
            <summary>Example posting, key skills and {t.terms.length} search terms</summary>
            <div className="small muted" style={{ marginTop: 6 }}>Written by the AI (typical for this role, not a real job):</div>
            <pre className="target-posting">{t.posting}</pre>
            <div className="small muted">Key skills (used by the "Most like" sort):</div>
            <div className="chips">{t.keywords.map((k) => <span key={k} className="chip">{k}</span>)}</div>
            <div className="small muted" style={{ marginTop: 6 }}>Search terms:</div>
            <div className="chips">{t.terms.map((x) => <span key={x} className="chip">{x}</span>)}</div>
          </details>
          {busy === "search" && <Progress done={prog?.done} total={prog?.total} label="Searches" expectMs={60000} />}
          <div className="row" style={{ marginTop: 8 }}>
            {isDesktop() ? <button disabled={!!busy} onClick={() => void search()}>{busy === "search" ? "Searching…" : "Search jobs like this"}</button> : <span className="small muted">Searching runs on the laptop app.</span>}
            {busy === "search" && <button className="ghost" onClick={() => window.desktop!.stopBoards()}>Stop</button>}
            <button className="ghost" disabled={!!busy} onClick={addTerms} title="Adds these terms to Find jobs → LinkedIn and Indeed">Add terms to Find jobs</button>
            <button className="ghost" disabled={!!busy || !hasKey} title="Uses AI tokens" onClick={() => void write(t.title)}>✦ Regenerate</button>
            {(t.jobs || []).length > 0 && <button className="ghost" disabled={!!busy} onClick={async () => { if (await confirmDelete(`Clear the ${(t.jobs || []).length} jobs stored under "${t.title}"? Saved, applied and tailored items stay.`)) { update((s) => ({ ...s, targets: (s.targets || []).map((x) => (x.title === t.title ? { ...x, jobs: [] } : x)) })); setSel(null); } }}>Clear jobs</button>}
            <button className="ghost" disabled={!!busy} onClick={async () => { if (await confirmDelete(`Remove "${t.title}" and its ${(t.jobs || []).length} stored jobs? Saved, applied and tailored items stay.`)) { update((s) => ({ ...s, targets: (s.targets || []).filter((x) => x.title !== t.title) })); setSel(null); } }}>Remove title</button>
          </div>
          <div className="status">{status}</div>
          {err && <div className="status err">{err}</div>}
          <div className="small muted">Sort by "Most like: {t.title}" in Filters &amp; sort to see the closest matches first.</div>
        </>
      )}
      {busy === "write" && <Progress label="Writing the example posting" expectMs={15000} />}
      {!t && err && <div className="status err">{err}</div>}
    </div>
  );
  return (
    <div className="search-page targets-page">
      <Jobs mode="targets" jobs={t?.jobs || []} state={state} update={update} sel={sel} setSel={setSel} open={open} header={header} />
    </div>
  );
}
