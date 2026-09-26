import { useEffect, useRef, useState } from "react";
import { DEFAULT_META, defaultState, type Job, type Meta, type Profile, type State } from "./types";
import { splitLinks } from "./links";
import { withStored } from "./limits";
import type { LatLon } from "./geo";

const KEY = "autoresume";
const withTimeout = (p: Promise<Response>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

async function fetchState(ms: number): Promise<State | null> {
  try { const r = await withTimeout(fetch("/api/state", { cache: "no-store" }), ms); return r.ok ? await r.json() : null; }
  catch { return null; }
}

async function load(): Promise<State> {
  let s = await fetchState(4000);
  if (!s) { try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { /* ignore */ } } // laptop unreachable: this device's copy
  return normalize(s);
}

/** Fill in defaults and run one-time migrations on a saved state. */
function normalize(s: State | null): State {
  const merged: State = { ...defaultState, ...(s || {}), profile: { ...defaultState.profile, ...(s?.profile || {}) } };
  // Older saved state kept all links in one string: sort them into the new fields once.
  const sp = s?.profile as Partial<Profile> | undefined;
  if (sp && sp.linkedin === undefined && sp.github === undefined && sp.portfolio === undefined && sp.links) merged.profile = { ...merged.profile, ...splitLinks(sp.links) };
  // One-time switch of older saved state to the new default template.
  if ((s?.defaultsVersion ?? 1) < 2) { merged.template = "standard"; merged.defaultsVersion = 2; }
  // Tailored resumes from before ranking: keep what they showed, store the rest of your details underneath.
  merged.tailored = Object.fromEntries(Object.entries(merged.tailored || {}).map(([id, t]) => [id, withStored(t, merged.profile)]));
  return merged;
}

type Patch = Partial<State> | ((s: State) => State);
/** Apply a change; an imported backup's old `_rev` is ignored so it can't make the save look stale forever. */
const apply = (s: State, p: Patch): State => (typeof p === "function" ? p(s) : { ...s, ...p, _rev: s._rev });

/**
 * State lives on the laptop (state.json) and is cached in localStorage on every device (laptop window, tablet, phone).
 * Saves are revision-checked: if another device saved first, this device fetches the laptop's copy and re-applies
 * only its own unsaved changes, so an old copy on one device can never overwrite newer data from another.
 * Devices also pick up other devices' changes when you come back to them (and every 30 s).
 */
export function useAppState(): [State, (patch: Patch) => void, boolean] {
  const [state, setState] = useState<State>(defaultState);
  const [ready, setReady] = useState(false);
  const cur = useRef<State>(defaultState);
  const pending = useRef<Patch[]>([]); // changes not yet saved on the laptop
  const timer = useRef<number | undefined>(undefined);
  const put = (s: State) => { cur.current = s; setState(s); try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } };
  const schedule = (ms = 500) => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => void flush(), ms); };
  const flush = async (): Promise<void> => {
    if (!pending.current.length) return;
    const sent = pending.current.length;
    try {
      const r = await fetch("/api/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cur.current) });
      if (r.ok) {
        const out = await r.json();
        cur.current = { ...cur.current, _rev: out.rev };
        try { localStorage.setItem(KEY, JSON.stringify(cur.current)); } catch { /* ignore */ }
        pending.current = pending.current.slice(sent);
        if (pending.current.length) schedule();
        return;
      }
      if (r.status === 409) {
        const latest = await fetchState(5000);
        if (latest) { put({ ...pending.current.reduce(apply, normalize(latest)), _rev: latest._rev }); return flush(); }
      }
    } catch { /* laptop unreachable: keep the changes */ }
    schedule(5000);
  };
  useEffect(() => {
    load().then((s) => { put(s); setReady(true); });
    const refresh = async () => {
      if (pending.current.length || document.visibilityState === "hidden") return;
      const latest = await fetchState(3000);
      if (latest && latest._rev !== cur.current._rev && !pending.current.length) put(normalize(latest));
    };
    const iv = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(iv); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const update = (patch: Patch) => { pending.current.push(patch); put(apply(cur.current, patch)); schedule(); };
  return [state, update, ready];
}

export async function fetchJobs(): Promise<Job[]> {
  try { const r = await fetch("/api/jobs"); return r.ok ? r.json() : []; } catch { return []; }
}

/** Portal's exact lists once scraped; built-in defaults before that. */
/** Read a job posting from its link on the laptop app (works from the tablet too). No AI. */
export async function scrapePosting(url: string): Promise<Job> {
  let r: Response;
  try { r = await fetch("/api/posting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }); }
  catch { throw new Error("Reading links needs the laptop app running. Paste the posting's text instead."); }
  const out = await r.json().catch(() => ({ error: "The laptop app needs updating to read links." }));
  if (!r.ok || !out.job) throw new Error(out.error || "Couldn't read that link.");
  return out.job as Job;
}

/** Visible text of a public page, read by the laptop app (e.g. your portfolio). */
export async function fetchPageText(url: string): Promise<string> {
  let r: Response;
  try { r = await fetch("/api/page-text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }); }
  catch { throw new Error("Reading links needs the laptop app running. Paste the text instead."); }
  const out = await r.json().catch(() => ({ error: "The laptop app needs updating to read links." }));
  if (!r.ok || typeof out.text !== "string") throw new Error(out.error || "Couldn't read that link.");
  return out.text;
}

export async function fetchBoardJobs(): Promise<Job[]> {
  try { const r = await fetch("/api/board-jobs"); return r.ok ? r.json() : []; } catch { return []; }
}

/** Look up places through the laptop app (OneMap, then OpenStreetMap; cached there). 25 at a time. */
export async function geocode(queries: string[], region: string): Promise<Record<string, LatLon | null>> {
  const r = await fetch("/api/geocode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queries, region }) });
  if (!r.ok) throw new Error("Location lookup is only available while the laptop app is running.");
  return (await r.json()).results || {};
}

export async function fetchMeta(): Promise<Meta> {
  try {
    const r = await fetch("/api/meta");
    if (r.ok) { const m: Meta = await r.json(); if (m.employmentTypes?.length || m.programmes?.length) return m; }
  } catch { /* offline */ }
  return DEFAULT_META;
}
