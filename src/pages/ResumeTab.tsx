import { useEffect, useRef, useState } from "react";
import { LetterPage, MIN_FONT_PT, ResumePage, type FitInfo } from "../Resume";
import { isDesktop, type Job, type Profile, type State, type Template } from "../types";
import { stamp, type Update, aiConfirm } from "../appShared";
import { confirmDelete, Progress } from "../ui/common";
import { taskOf, useJobTasks, jobAi, jobAiQuestion } from "../jobTasks";
import { ProfileBody } from "./Details";

/* ---------------- Resume / cover letter (A4) ---------------- */

/** One-line summary of how the A4 fitting went, shown above each page. */
export function FitNote({ fit }: { fit: FitInfo | null }) {
  if (!fit) return null;
  const base = !!fit.pages && !fit.maxPages;
  return (
    <span className={`small fit-note ${fit.hiddenBullets || !fit.fits ? "warn" : "muted"}`} title={base ? "Your base resume shows everything you've entered; tailored resumes are fitted to at most 2 A4 pages" : `Tailored resumes fit at most ${fit.maxPages || 1} A4 page${(fit.maxPages || 1) > 1 ? "s" : ""}; text is never smaller than ${MIN_FONT_PT} pt`}>
      {base ? `${fit.pages} A4 page${fit.pages === 1 ? "" : "s"} · everything you've entered · tailored resumes fit at most 2 pages` : [
        fit.maxPages ? `${fit.pages} of ${fit.maxPages} A4 pages` : "One A4 page",
        fit.extraProjects ? `${fit.extraProjects} more project${fit.extraProjects === 1 ? "" : "s"} added to fill page 2` : "",
        `smallest text ${fit.smallestPt.toFixed(1)} pt`,
        fit.scale < 0.999 ? `shrunk to ${Math.round(fit.scale * 100)}%` : "",
        fit.tight ? "tighter spacing" : "",
        fit.hiddenBullets ? `${fit.hiddenBullets} bullet point${fit.hiddenBullets === 1 ? "" : "s"} left off to fit; choose what shows with Edit` : "",
        !fit.fits ? "still too long: shorten it with Edit" : "",
      ].filter(Boolean).join(" · ")}
    </span>
  );
}

/** An empty resume / cover-letter pane: generate it here for this job (or open the posting). */
export function EmptyDoc({ kind, job, state, update, openJob }: { kind: "resume" | "letter"; job?: Job; state: State; update: Update; openJob: () => void }) {
  const task = job ? taskOf(job.id) : null;
  const running = !!task?.running.includes(kind);
  const what = kind === "resume" ? "tailored resume" : "cover letter";
  if (!job) return <div className="empty">No {what} for this job yet, and the posting is no longer in your lists.</div>;
  return (
    <div className="empty">
      <div>No {what} for this job yet.</div>
      {running ? <Progress label={kind === "resume" ? "Tailoring and fact-checking your resume" : "Writing and fact-checking your cover letter"} expectMs={60000} /> : (
        <div className="row" style={{ marginTop: 10 }}>
          <button title="Uses AI tokens" onClick={() => { if (aiConfirm(state, jobAiQuestion(kind, job, state))) void jobAi(kind, job, state, update); }}>
            ✦ {kind === "resume" ? "Tailor resume for this job" : "Write cover letter for this job"}
          </button>
          <button className="ghost small" onClick={openJob}>Go to the posting</button>
        </div>
      )}
      {task?.error && !running && <div className="status err">{task.error}</div>}
    </div>
  );
}

/**
 * Resume tab: your base resume, or one job's tailored resume and cover letter side by side (stacked on a phone),
 * with a button back to that job's posting. Each document saves as its own A4 PDF.
 */
export function ResumeTab({ state, update, jobs, doc, setDoc, openJob }: {
  state: State; update: Update; jobs: Job[]; doc: { kind: "resume" | "letter"; jobId: string }; setDoc: (d: { kind: "resume" | "letter"; jobId: string }) => void;
  openJob: (jobId: string) => void;
}) {
  useJobTasks();
  const paneRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [resumeFit, setResumeFit] = useState<FitInfo | null>(null);
  const [letterFit, setLetterFit] = useState<FitInfo | null>(null);
  const [editing, setEditing] = useState(false);
  const [editingLetter, setEditingLetter] = useState(false);
  const jobId = doc.jobId;
  useEffect(() => {
    const measure = () => setZoom(Math.min(1, ((paneRef.current?.clientWidth || 800) - 16) / 794));
    measure();
    const ro = new ResizeObserver(measure);
    if (paneRef.current) ro.observe(paneRef.current);
    return () => ro.disconnect();
  }, [jobId]);
  const job = jobs.find((x) => x.id === jobId);
  const label = (id: string) => { const j = jobs.find((x) => x.id === id); return j ? `${j.title} — ${j.company}` : "A job no longer in your lists"; };
  // The header always comes from your current details, so every tailored version (old or new) shows them.
  const { name, email, phone, location, portfolio, linkedin, github, links } = state.profile;
  const tailoredVersion = jobId ? state.tailored[jobId] : undefined;
  const profile = tailoredVersion ? { ...tailoredVersion, name, email, phone, location, portfolio, linkedin, github, links } : state.profile;
  const letter = jobId ? state.covers[jobId] || "" : "";
  /** Edits go straight into the version being viewed: the tailored copy, or your base details. */
  const editVersion = (patch: Partial<Profile>) => update((s) => (tailoredVersion
    ? { ...s, tailored: { ...s.tailored, [jobId]: { ...s.tailored[jobId], ...patch } }, generatedAt: { ...(s.generatedAt || {}), [`edited:${jobId}`]: new Date().toISOString() } }
    : { ...s, profile: { ...s.profile, ...patch } }));
  const fileName = (kind: "resume" | "letter") => `${state.profile.name || "resume"} - ${kind === "letter" ? "cover letter" : "resume"}${jobId ? " - " + label(jobId).replace(/[\\/:*?"<>|]/g, "") : ""}`;
  /** Print / save one document: the other pane is hidden while printing. */
  const save = async (kind: "resume" | "letter") => {
    document.body.dataset.print = kind;
    try {
      if (isDesktop()) await window.desktop!.savePdf(fileName(kind));
      else { window.print(); }
    } finally { delete document.body.dataset.print; }
  };
  // One entry per job that has a tailored resume and/or a cover letter.
  const docJobs = [...new Set([...Object.keys(state.tailored), ...Object.keys(state.covers)])];
  const what = (id: string) => [state.tailored[id] ? "resume" : "", state.covers[id] ? "letter" : ""].filter(Boolean).join(" + ");
  return (
    <div className="resume-tab">
      <div className="toolbar app-chrome">
        <select value={jobId} onChange={(e) => { setDoc({ kind: "resume", jobId: e.target.value }); setEditing(false); setEditingLetter(false); }}>
          <option value="">Base resume (everything you've entered)</option>
          {docJobs.map((id) => <option key={id} value={id}>{label(id)} · {what(id)}{stamp(state, "resume", id) || stamp(state, "letter", id) ? ` · ${stamp(state, "resume", id) || stamp(state, "letter", id)}` : ""}</option>)}
        </select>
        {jobId && <button className="ghost" disabled={!job} title={job ? "Open this job's posting" : "This job was cleared from your lists"} onClick={() => openJob(jobId)}>← Back to posting</button>}
        <select value={state.template} onChange={(e) => update({ template: e.target.value as Template })}>
          <option value="standard">Standard</option>
          <option value="classic">Classic</option>
          <option value="modern">Modern</option>
          <option value="compact">Compact</option>
        </select>
        <span className="small muted">{Math.round(zoom * 100)}%</span>
      </div>
      {editing && (
        <div className="resume-editor app-chrome">
          <div className="small muted">{tailoredVersion ? "Editing only this tailored version; changes save as you type and the preview updates live. No AI is used." : "Editing your base details (same as the Details tab)."} Header details come from the Details tab.</div>
          <ProfileBody p={profile} setP={editVersion} />
        </div>
      )}
      <div className={`doc-panes${jobId ? " two" : ""}`}>
        <section className="doc-pane resume">
          <div className="pane-bar app-chrome">
            <b>{jobId ? "Tailored resume" : "Base resume"}</b>
            {(tailoredVersion || !jobId) && <>
              <button onClick={() => void save("resume")}>{isDesktop() ? "Save PDF" : "Print / PDF"}</button>
              <button className={editing ? "" : "ghost"} onClick={() => setEditing(!editing)}>{editing ? "Done editing" : tailoredVersion ? "Edit this version" : "Edit"}</button>
              {tailoredVersion && <button className="ghost" onClick={async () => { if (await confirmDelete(`Delete the tailored resume for ${label(jobId)}? Your details and the cover letter stay.`)) { const t = { ...state.tailored }; delete t[jobId]; update({ tailored: t }); setEditing(false); } }}>Delete</button>}
            </>}
            <FitNote fit={tailoredVersion || !jobId ? resumeFit : null} />
          </div>
          <div className="preview" ref={paneRef}>
            {tailoredVersion || !jobId
              ? <div className="preview-zoom" style={{ zoom }}><ResumePage p={profile} template={state.template} onFit={setResumeFit} /></div>
              : <EmptyDoc kind="resume" job={job} state={state} update={update} openJob={() => openJob(jobId)} />}
          </div>
        </section>
        {jobId && (
          <section className="doc-pane letter">
            <div className="pane-bar app-chrome">
              <b>Cover letter</b>
              {letter && <>
                <button onClick={() => void save("letter")}>{isDesktop() ? "Save PDF" : "Print / PDF"}</button>
                <button className={editingLetter ? "" : "ghost"} onClick={() => setEditingLetter(!editingLetter)}>{editingLetter ? "Done editing" : "Edit text"}</button>
                <button className="ghost" onClick={async () => { if (await confirmDelete(`Delete the cover letter for ${label(jobId)}? The tailored resume stays.`)) { const c = { ...state.covers }; delete c[jobId]; update({ covers: c }); setEditingLetter(false); } }}>Delete</button>
              </>}
              <FitNote fit={letter ? letterFit : null} />
            </div>
            {editingLetter && (
              <div className="app-chrome" style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)" }}>
                <textarea value={letter} rows={8} onChange={(e) => update((s) => ({ ...s, covers: { ...s.covers, [jobId]: e.target.value } }))} placeholder="Cover letter text (editable)" />
              </div>
            )}
            <div className="preview">
              {letter
                ? <div className="preview-zoom" style={{ zoom }}><LetterPage p={state.profile} text={letter} template={state.template} onFit={setLetterFit} /></div>
                : <EmptyDoc kind="letter" job={job} state={state} update={update} openJob={() => openJob(jobId)} />}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
