import { useEffect, useMemo, useState } from "react";
import { fetchBoardJobs, fetchJobs, useAppState } from "./store";
import { type Job } from "./types";
import { DeleteDialog } from "./ui/common";
import { Jobs } from "./pages/Jobs";
import { FindPage } from "./pages/FindJobs";
import { TargetsPage } from "./pages/Targets";
import { ResumeTab } from "./pages/ResumeTab";
import { Settings } from "./pages/Settings";

type Tab = "jobs" | "find" | "targets" | "saved" | "applied" | "resume" | "details" | "settings";

const TAB_LABEL: Record<Tab, string> = { jobs: "Jobs", find: "Find jobs", targets: "Targets", saved: "Saved", applied: "Applied", resume: "Resume", details: "Details", settings: "Settings" };
/** Each screen is one window; its title bar takes one of the three panel colours, in turn along the menu. */
const WINDOW: Record<Tab, "magenta" | "teal" | "orange"> = { jobs: "magenta", find: "teal", targets: "orange", saved: "magenta", applied: "teal", resume: "orange", details: "teal", settings: "orange" };

export default function App() {
  const [state, update, ready] = useAppState();
  const [tab, setTab] = useState<Tab>("jobs");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [boardJobs, setBoardJobs] = useState<Job[]>([]);
  const [sel, setSelMap] = useState<Partial<Record<Tab, Job | null>>>({});
  const [doc, setDoc] = useState<{ kind: "resume" | "letter"; jobId: string }>({ kind: "resume", jobId: "" });
  const reloadJobs = () => { fetchJobs().then(setJobs); fetchBoardJobs().then(setBoardJobs); };
  useEffect(reloadJobs, []);
  // Every job once (target copies keep their details even after search results are cleared).
  const allJobs = useMemo(() => [...new Map([...(state.targets || []).flatMap((t) => t.jobs || []), ...boardJobs, ...(state.pasted || []), ...jobs].map((j) => [j.id, j])).values()], [jobs, boardJobs, state.pasted, state.targets]);
  const targetJobs = (state.targets || []).reduce((n, t) => n + (t.jobs || []).length, 0);
  if (!ready) return null;
  const open = (kind: "resume" | "letter", jobId: string) => { setDoc({ kind, jobId }); setTab("resume"); };
  const selFor = (t: Tab) => ({ sel: sel[t] || null, setSel: (j: Job | null) => setSelMap((m) => ({ ...m, [t]: j })) });
  const common = { state, update, open };
  const savedJobs = allJobs.filter((j) => state.saved.includes(j.id));
  const appliedJobs = allJobs.filter((j) => state.applied?.[j.id]);
  return (
    <div className="layout">
      <DeleteDialog />
      <nav className="tabs app-chrome">
        <span className="brand"><span aria-hidden="true">✦</span> AutoResume</span>
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "on" : ""} aria-current={tab === t ? "page" : undefined} onClick={() => setTab(t)}>
            {TAB_LABEL[t]}{t === "targets" && targetJobs ? ` (${targetJobs})` : ""}{t === "saved" && savedJobs.length ? ` (${savedJobs.length})` : ""}{t === "applied" && appliedJobs.length ? ` (${appliedJobs.length})` : ""}
          </button>
        ))}
      </nav>
      <main>
        <section className={`window win-${WINDOW[tab]}`} aria-labelledby="screen-title">
        <header className="titlebar app-chrome"><h1 id="screen-title">{TAB_LABEL[tab]}</h1></header>
        <div className="win-body">
        {tab === "jobs" && <Jobs mode="all" jobs={allJobs} onCleared={reloadJobs} {...common} {...selFor("jobs")} />}
        {tab === "find" && <FindPage jobs={jobs} setJobs={setJobs} boardJobs={boardJobs} setBoardJobs={setBoardJobs} state={state} update={update}
          onView={(j) => { if (j) selFor("jobs").setSel(j); setTab("jobs"); }} />}
        {tab === "targets" && <TargetsPage setBoardJobs={setBoardJobs} {...common} {...selFor("targets")} />}
        {tab === "saved" && <Jobs mode="saved" jobs={savedJobs} {...common} {...selFor("saved")} />}
        {tab === "applied" && <Jobs mode="applied" jobs={appliedJobs} {...common} {...selFor("applied")} />}
        {tab === "resume" && <ResumeTab state={state} update={update} jobs={allJobs} doc={doc} setDoc={setDoc}
          openJob={(id) => { const j = allJobs.find((x) => x.id === id); if (j) { selFor("jobs").setSel(j); setTab("jobs"); } }} />}
        {tab === "details" && <Settings part="details" state={state} update={update} />}
        {tab === "settings" && <Settings part="settings" state={state} update={update} />}
        </div>
        </section>
      </main>
    </div>
  );
}
