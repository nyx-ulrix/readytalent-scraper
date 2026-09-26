import type { Entry, Profile } from "./types";

/**
 * How much a resume shows. Every list is stored in full and in rank order (most relevant first); the page
 * shows the top of each list. Tailoring ranks for the job and records how many it picked in `p.show`;
 * the base resume shows the first ones in your list (reorder with ↑ or ✦ Rank by relevance).
 */
export const MAX_PROJECTS = 3;
export const MAX_LEADERSHIP = 2;
export const MAX_SKILLS = 18;

/** "Leadership & Co-Curricular Activities", "Leadership", "CCA"... */
export const isLeadership = (title: string) => /leadership|co-?curricular|\bccas?\b/i.test(title || "");

/** Entry limit for a custom section (Infinity = no limit). */
export const sectionLimit = (title: string) => (isLeadership(title) ? MAX_LEADERSHIP : Infinity);

/** Keys in `p.show`: "projects", "skills", or "sec:" + section title. */
export const sectionKey = (title: string) => `sec:${title}`;
export const shownCount = (p: Profile, key: string, max: number) => Math.min(p.show?.[key] ?? max, max);

/**
 * The part of the profile that goes on the page. On the base resume (no tailoring), entries you marked
 * "only if very relevant" are left out; a tailored resume shows what the AI picked for that job.
 */
export function visible(p: Profile): Profile {
  const base = !p.show;
  const keep = (list: Entry[]) => (base ? list.filter((e) => !e.onlyIfVeryRelevant) : list);
  return {
    ...p,
    skills: p.skills.slice(0, shownCount(p, "skills", MAX_SKILLS)),
    projects: keep(p.projects).slice(0, shownCount(p, "projects", MAX_PROJECTS)),
    sections: (p.sections || []).map((s) => ({ ...s, entries: keep(s.entries).slice(0, shownCount(p, sectionKey(s.title), sectionLimit(s.title))) })),
  };
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Reorder `list` by the names in `ranked` (matched case-insensitively); unnamed items keep their order after them. */
export function byRank<T>(list: T[], ranked: unknown, name: (x: T) => string): T[] {
  const want = Array.isArray(ranked) ? ranked.map((r) => norm(String(r))) : [];
  const pos = (x: T) => { const i = want.indexOf(norm(name(x))); return i < 0 ? want.length : i; };
  return list.map((x, i) => ({ x, i, p: pos(x) })).sort((a, b) => a.p - b.p || a.i - b.i).map((o) => o.x);
}

/**
 * Tailored resumes made before ranking kept only the picked entries. Record what they showed and put
 * everything else from your details back underneath (stored, not shown).
 */
export function withStored(t: Profile, base: Profile): Profile {
  if (t.show) return t;
  const same = (a: Entry, b: Entry) => norm(a.title) === norm(b.title);
  const add = (have: Entry[], all: Entry[]) => [...have, ...all.filter((e) => !have.some((h) => same(h, e)))];
  const show: Record<string, number> = { projects: t.projects.length, skills: t.skills.length };
  for (const s of t.sections || []) show[sectionKey(s.title)] = s.entries.length;
  return {
    ...t,
    show,
    skills: [...t.skills, ...base.skills.filter((s) => !t.skills.some((x) => norm(x) === norm(s)))],
    projects: add(t.projects, base.projects),
    sections: (t.sections || []).map((s) => ({ ...s, entries: add(s.entries, (base.sections || []).find((b) => norm(b.title) === norm(s.title))?.entries || []) })),
  };
}
