import type { Entry, Profile } from "./types";

/**
 * Add newly found details (a newer resume, a portfolio page, pasted text) to the user's existing details.
 * Nothing already there is deleted or reworded: matching entries only gain bullets they did not have and
 * fill empty fields; everything else new is appended (lists are ranked, so new items sit below yours).
 */

const words = (t: string) => new Set((t || "").toLowerCase().replace(/&/g, "and").split(/[^a-z0-9]+/).filter((w) => w.length > 2));
/** Share of distinct words two strings have in common (0..1). */
function overlap(a: string, b: string): number {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return 0;
  return [...x].filter((w) => y.has(w)).length / new Set([...x, ...y]).size;
}
const key = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const isNew = (have: string[], s: string, same = 0.6) => !!s.trim() && !have.some((h) => key(h) === key(s) || overlap(h, s) >= same);
/** A bullet is already there if it matches one bullet, or is a rewording that combines several (80% of its words already used). */
function newBullet(have: string[], b: string): boolean {
  if (!isNew(have, b)) return false;
  const w = [...words(b)], used = new Set(have.flatMap((h) => [...words(h)]));
  return !w.length || w.filter((x) => used.has(x)).length / w.length < 0.8;
}

export type MergeCount = { entries: number; bullets: number; skills: number; other: number };

function mergeEntries(cur: Entry[], inc: Entry[], n: MergeCount, byOrg = false): Entry[] {
  const out = cur.map((e) => ({ ...e, details: [...e.details] }));
  for (const e of inc) {
    if (!e.title?.trim() && !e.org?.trim()) continue;
    const m = out.find((o) => (key(o.title) && key(o.title) === key(e.title)) || overlap(o.title, e.title) >= 0.7 || (byOrg && key(o.org) && key(o.org) === key(e.org)));
    if (!m) { out.push({ ...e, details: e.details.filter((d) => d.trim()) }); n.entries++; continue; }
    for (const b of e.details) if (newBullet(m.details, b)) { m.details.push(b.trim()); n.bullets++; }
    m.org ||= e.org; m.location ||= e.location; m.dates ||= e.dates;
  }
  return out;
}

/** "Soft Skills: A | B" lines merged by label; new items are added to the end of the line. */
function mergeLines(cur: string[], inc: string[], n: MergeCount): string[] {
  const label = (l: string) => l.match(/^([^:]{1,40}):/)?.[1] || "";
  const items = (l: string) => l.replace(/^[^:]{1,40}:\s*/, "").split(/\s*[|,]\s*/).filter(Boolean);
  const out = [...cur];
  for (const l of inc) {
    const i = out.findIndex((o) => label(o) && key(label(o)) === key(label(l)));
    if (i < 0) { if (isNew(out, l, 0.8)) { out.push(l); n.other++; } continue; }
    const have = items(out[i]);
    const add = items(l).filter((x) => !have.some((h) => key(h) === key(x)));
    if (add.length) { out[i] = `${label(out[i])}: ${[...have, ...add].join(" | ")}`; n.other += add.length; }
  }
  return out;
}

export function mergeProfile(cur: Profile, inc: Partial<Profile>): { profile: Profile; added: MergeCount } {
  const n: MergeCount = { entries: 0, bullets: 0, skills: 0, other: 0 };
  const skills = [...cur.skills];
  for (const s of inc.skills || []) if (s.trim() && !skills.some((x) => key(x) === key(s))) { skills.push(s.trim()); n.skills++; }
  const sections = (cur.sections || []).map((s) => ({ ...s, entries: [...s.entries] }));
  for (const s of inc.sections || []) {
    const m = sections.find((o) => key(o.title) === key(s.title) || overlap(o.title, s.title) >= 0.5 || o.entries.some((a) => s.entries.some((b) => overlap(a.title, b.title) >= 0.7)));
    if (m) m.entries = mergeEntries(m.entries, s.entries, n);
    else if (s.title && s.entries.length) { sections.push({ title: s.title, entries: mergeEntries([], s.entries, n) }); }
  }
  const awards = [...cur.awards];
  for (const a of inc.awards || []) if (isNew(awards, a, 0.8)) { awards.push(a.trim()); n.other++; }
  const fill = (k: "name" | "email" | "phone" | "location" | "portfolio" | "linkedin" | "github" | "links" | "summary") => cur[k] || (inc[k] || "").trim();
  return {
    profile: {
      ...cur,
      name: fill("name"), email: fill("email"), phone: fill("phone"), location: fill("location"),
      portfolio: fill("portfolio"), linkedin: fill("linkedin"), github: fill("github"), links: fill("links"), summary: fill("summary"),
      skills,
      experience: mergeEntries(cur.experience, inc.experience || [], n),
      education: mergeEntries(cur.education, inc.education || [], n, true),
      projects: mergeEntries(cur.projects, inc.projects || [], n),
      sections, awards,
      additional: mergeLines(cur.additional || [], inc.additional || [], n),
    },
    added: n,
  };
}

/** "2 new entries, 5 new bullet points, 3 skills" (or "nothing new"). */
export const mergeSummary = (a: MergeCount) =>
  [[a.entries, "new entr", "y", "ies"], [a.bullets, "new bullet point", "", "s"], [a.skills, "skill", "", "s"], [a.other, "other item", "", "s"]]
    .filter(([c]) => (c as number) > 0).map(([c, w, one, many]) => `${c} ${w}${c === 1 ? one : many}`).join(", ") || "nothing new";
