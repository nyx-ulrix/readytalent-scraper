import { useEffect, useRef, useState } from "react";
import { DEFAULT_META, defaultState, type Job, type Meta, type Profile, type State } from "./types";
import { splitLinks } from "./links";
import type { LatLon } from "./geo";

const KEY = "autoresume";
const withTimeout = (p: Promise<Response>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

async function load(): Promise<State> {
  let s: State | null = null;
  try {
    const r = await withTimeout(fetch("/api/state"), 1500);
    if (r.ok) s = await r.json();
  } catch { /* offline from laptop: fall back to this device */ }
  if (!s) { try { s = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { /* ignore */ } }
  const merged: State = { ...defaultState, ...(s || {}), profile: { ...defaultState.profile, ...(s?.profile || {}) } };
  // Older saved state kept all links in one string: sort them into the new fields once.
  const sp = s?.profile as Partial<Profile> | undefined;
  if (sp && sp.linkedin === undefined && sp.github === undefined && sp.portfolio === undefined && sp.links) merged.profile = { ...merged.profile, ...splitLinks(sp.links) };
  // One-time switch of older saved state to the new default template.
  if ((s?.defaultsVersion ?? 1) < 2) { merged.template = "standard"; merged.defaultsVersion = 2; }
  return merged;
}

/** State lives in localStorage on every device and mirrors to the laptop's state.json when reachable. */
export function useAppState(): [State, (patch: Partial<State> | ((s: State) => State)) => void, boolean] {
  const [state, setState] = useState<State>(defaultState);
  const [ready, setReady] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => { load().then((s) => { setState(s); setReady(true); }); }, []);
  const update = (patch: Partial<State> | ((s: State) => State)) =>
    setState((prev) => {
      const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        fetch("/api/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => undefined);
      }, 500);
      return next;
    });
  return [state, update, ready];
}

export async function fetchJobs(): Promise<Job[]> {
  try { const r = await fetch("/api/jobs"); return r.ok ? r.json() : []; } catch { return []; }
}

/** Portal's exact lists once scraped; built-in defaults before that. */
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
