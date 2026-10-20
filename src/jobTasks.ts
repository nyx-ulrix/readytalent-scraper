import { useEffect, useState } from "react";
import { coverLetter, extractKeywords, sourceText, tailorResume } from "./ai";
import { type Job, type State } from "./types";
import { aiCfg, type Update, skillPrefs } from "./appShared";

/**
 * AI work running per job, shared by every view: several jobs can be tailored (or get letters / keywords) at the
 * same time, switching jobs or tabs doesn't stop anything, and each job keeps its own progress and messages.
 */
export type JobWork = "kw" | "resume" | "letter";

export type JobTask = { running: JobWork[]; error: string; done: string };

export const jobTasks = new Map<string, JobTask>();

export const taskListeners = new Set<() => void>();

export const taskOf = (id: string): JobTask => jobTasks.get(id) || { running: [], error: "", done: "" };

export const setTask = (id: string, f: (t: JobTask) => JobTask) => { jobTasks.set(id, f(taskOf(id))); taskListeners.forEach((l) => l()); };

/** Re-render when any job's AI work starts or finishes. */
export function useJobTasks() {
  const [, tick] = useState(0);
  useEffect(() => { const l = () => tick((n) => n + 1); taskListeners.add(l); return () => { taskListeners.delete(l); }; }, []);
}

/**
 * Run one AI task for a job: ATS keywords, a tailored resume, or a cover letter (the latter two extract keywords
 * first if needed). Progress, errors and the "ready" message go to that job's entry in the shared task store, so
 * any view can start it and every view shows it; other jobs can run at the same time.
 */
export async function jobAi(kind: JobWork, job: Job, state: State, update: Update) {
  const id = job.id;
  const done = (msg: string) => setTask(id, (t) => ({ ...t, done: msg }));
  setTask(id, (t) => ({ running: [...t.running, kind], error: "", done: "" }));
  try {
    const getKeywords = async (force = false) => {
      if (state.keywords[id] && !force) return state.keywords[id];
      const k = await extractKeywords(aiCfg(state), job, sourceText(state.profile, state.about || ""));
      update((s) => ({ ...s, keywords: { ...s.keywords, [id]: k } }));
      return k;
    };
    if (kind === "kw") await getKeywords(true);
    if (kind === "resume") {
      const k = await getKeywords();
      const t = await tailorResume(aiCfg(state), state.profile, job, k, state.about || "", skillPrefs(state, id));
      update((s) => ({ ...s, tailored: { ...s.tailored, [id]: t }, generatedAt: { ...(s.generatedAt || {}), [`resume:${id}`]: new Date().toISOString() } }));
      done("Tailored resume ready. Use View resume to see it.");
    }
    if (kind === "letter") {
      const k = await getKeywords();
      const c = await coverLetter(aiCfg(state), state.profile, job, k, state.about || "", state.tailored[id], skillPrefs(state, id));
      update((s) => ({ ...s, covers: { ...s.covers, [id]: c }, generatedAt: { ...(s.generatedAt || {}), [`letter:${id}`]: new Date().toISOString() } }));
      done("Cover letter ready. Use View letter to see it.");
    }
  } catch (e) { setTask(id, (t) => ({ ...t, error: (e as Error).message })); }
  setTask(id, (t) => ({ ...t, running: t.running.filter((x) => x !== kind) }));
}

/** The token-cost question each AI button asks first. */
export const jobAiQuestion = (kind: JobWork, job: Job, state: State) => {
  const kw = state.keywords[job.id] ? "" : " (also extracts ATS keywords)";
  return kind === "kw" ? (state.keywords[job.id] ? "Refresh the ATS keywords for this job?" : "Extract ATS keywords for this job?")
    : kind === "resume" ? `${state.tailored[job.id] ? "Re-tailor" : "Tailor"} your resume for this job?${kw} Runs a draft and a fact-check pass.`
    : `${state.covers[job.id] ? "Rewrite" : "Write"} a cover letter for this job?${kw} Runs a draft and a fact-check pass.`;
};
