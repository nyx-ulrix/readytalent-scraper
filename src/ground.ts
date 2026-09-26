import type { Entry, Job, Profile } from "./types";
import { sectionKey } from "./limits.ts";

/**
 * Deterministic guard run after every AI rewrite: the output may only contain facts from the
 * candidate's own source text (their resume + the notes they typed). The AI rewords; this file
 * makes sure nothing new slips through:
 * - contact details, entry titles/orgs/locations/dates, awards and section names are pinned to the original;
 * - entries the AI invented are dropped; education and work experience always stay; projects, extra-section entries and skills
 *   are ranked (the AI's picks first, in its order, then everything else) and `show` records how many the AI picked;
 * - a bullet or summary containing a number that is not in the source reverts to the original;
 * - skills and labelled-line items (Soft Skills, Languages...) must appear in the source text.
 */

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Numbers as written ("1,200", "500+", "0.1s", "2020–2024") normalised to bare digits. */
export const numbersIn = (s: string) => (s.match(/\d+(?:[.,]\d+)*/g) || []).map((n) => n.replace(/,/g, ""));

export function numbersSupported(text: string, source: string): boolean {
  const have = new Set(numbersIn(source));
  return numbersIn(text).every((n) => have.has(n));
}

/** Whole-word, case-insensitive: "Java" does not match "JavaScript"; "C#" and "HTML/CSS" work. */
export function inSource(term: string, source: string): boolean {
  const t = norm(term);
  if (!t) return false;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, "u").test(norm(source));
}

const entryText = (e: Entry) => [e.title, e.org, e.location || "", e.dates, ...e.details].join("\n");
/** Capitalised names inside sentences (not the first word): "Yahboom", "Flask", "Raspberry"... */
const namesIn = (text: string) =>
  new Set(text.split(/\n/).flatMap((line) => (line.match(/[A-Za-z0-9+#'’-]+/g) || []).slice(1)).filter((w) => /^[A-Z][A-Za-z0-9+#'’-]{2,}$/.test(w)).map((w) => w.toLowerCase()));

/** What a rewritten bullet may draw on: its own entry, the candidate's notes and general lines, but not other entries. */
/** `linked`: text of entries about the same work (a hackathon and the project built there), whose facts this entry may also use. */
type BulletContext = { notes: string; general: Set<string>; others: Set<string>; linked: string };

/**
 * Original entry with the AI's rewritten bullets. A bullet reverts to the original bullet in its slot if it
 * uses a number that is not in this entry or the notes, or names something that belongs to a different entry
 * (a bullet about the robot car must not end up under a web app).
 */
function pinEntry(o: Entry, a: Entry | undefined, ctx: BulletContext): Entry {
  const own = `${entryText(o)}\n${ctx.linked}`;
  const ownNames = namesIn(own);
  const ok = (d: string) => numbersSupported(d, `${own}\n${ctx.notes}`) && ![...namesIn(d)].some((n) => !ownNames.has(n) && !ctx.general.has(n) && ctx.others.has(n));
  const aiDetails = Array.isArray(a?.details) ? a!.details.map(String).filter((d) => d.trim()) : [];
  const details = aiDetails.map((d, j) => (ok(d) ? d : o.details[j])).filter((d): d is string => !!d);
  return { ...o, details: details.length ? details : o.details };
}
const sameEntry = (o: Entry, a: Entry) => !!a && norm(a.title || "") === norm(o.title) && norm(a.org || "") === norm(o.org);
const sameTitle = (o: Entry, a: Entry) => !!a && norm(a.title || "") === norm(o.title);

/** Every original entry is kept (education, work experience); matched by title and org, never by list position. */
function groundEntries(orig: Entry[], ai: Entry[] | undefined, ctx: (o: Entry) => BulletContext): Entry[] {
  const list = Array.isArray(ai) ? ai : [];
  return orig.map((o) => pinEntry(o, list.find((x) => sameEntry(o, x)) ?? list.find((x) => sameTitle(o, x)), ctx(o)));
}

/**
 * Every original entry, ranked: the ones the AI chose first (its order, rewritten bullets), then the rest
 * unchanged in your order. `shown` = how many the AI chose. Invented entries are ignored. If the AI's list is
 * missing or none of it matches, your order stands and `shown` is unset; with `allowEmpty`, a deliberately
 * empty list means show none (e.g. a hackathon section that only repeated listed projects).
 */
function rankEntries(orig: Entry[], ai: Entry[] | undefined, ctx: (o: Entry) => BulletContext, allowEmpty = false): { entries: Entry[]; shown?: number } {
  const used = new Set<number>();
  const top: Entry[] = [];
  for (const a of Array.isArray(ai) ? ai : []) {
    let i = orig.findIndex((o, k) => !used.has(k) && sameEntry(o, a));
    if (i < 0) i = orig.findIndex((o, k) => !used.has(k) && sameTitle(o, a)); // org reworded
    if (i < 0) continue;
    used.add(i);
    top.push(pinEntry(orig[i], a, ctx(orig[i])));
  }
  if (!top.length && !(allowEmpty && Array.isArray(ai) && ai.length === 0)) return { entries: orig };
  return { entries: [...top, ...orig.filter((_, k) => !used.has(k))], shown: top.length };
}

/** "Soft Skills: A | B, C" -> keep only items that appear in the source; drop the line if none survive. */
function groundLine(line: string, source: string): string | null {
  const m = line.match(/^([^:]{1,40}):\s*(.*)$/);
  if (!m) return inSource(line, source) ? line : null;
  const sep = m[2].includes("|") ? " | " : ", ";
  const items = m[2].split(/\s*[|,]\s*/).filter((it) => inSource(it, source));
  return items.length ? `${m[1]}: ${items.join(sep)}` : null;
}

export function groundProfile(orig: Profile, ai: Partial<Profile>, source: string): Profile {
  const additional = (Array.isArray(ai.additional) ? ai.additional.map(String) : orig.additional || [])
    .map((l) => groundLine(l, source)).filter((l): l is string => !!l);
  // A skill already on a labelled line (Soft Skills, Languages...) is not repeated under Technical Skills.
  const labelled = new Set(additional.flatMap((l) => (l.match(/^[^:]{1,40}:\s*(.*)$/)?.[1] || l).split(/\s*[|,]\s*/)).map(norm));
  const skills = (Array.isArray(ai.skills) ? ai.skills.map(String) : []).filter((s) => inSource(s, source) && !labelled.has(norm(s)));
  // Per-entry context: notes and general lines are shared; every other entry's names are off limits.
  const notes = source.includes("## Notes from the candidate") ? source.slice(source.indexOf("## Notes from the candidate")) : "";
  const general = namesIn([orig.summary, notes, ...(orig.additional || []), ...orig.awards].join("\n"));
  const all = [...orig.education, ...orig.experience, ...orig.projects, ...(orig.sections || []).flatMap((s) => s.entries)];
  // Two entries sharing a distinctive name found in no other entry (a hackathon and the project "Fitz" built there)
  // describe the same work, so either may use the other's facts; every other entry's names stay off limits.
  const namesOf = new Map(all.map((e) => [e, namesIn(entryText(e))]));
  const seen = new Map<string, number>();
  for (const set of namesOf.values()) for (const n of set) seen.set(n, (seen.get(n) || 0) + 1);
  const skillNames = new Set(orig.skills.map(norm));
  const linkedTo = (o: Entry) => all.filter((e) => e !== o && [...namesOf.get(o)!].some((n) => seen.get(n) === 2 && namesOf.get(e)!.has(n) && !general.has(n) && !skillNames.has(n)));
  const ctx = (o: Entry): BulletContext => ({ notes, general, others: namesIn(all.filter((e) => e !== o).map(entryText).join("\n")), linked: linkedTo(o).map(entryText).join("\n") });
  const summary = typeof ai.summary === "string" && numbersSupported(ai.summary, source) ? ai.summary : orig.summary;
  const show: Record<string, number> = {};
  // Skills: the AI's picks first, then every other skill you listed (stored, not shown).
  const picked = [...new Set(skills)];
  const shownSkills = picked.length ? picked : orig.skills.filter((s) => !labelled.has(norm(s)));
  show.skills = shownSkills.length;
  const projects = rankEntries(orig.projects, ai.projects, ctx);
  if (projects.shown !== undefined) show.projects = projects.shown;
  const sections = (orig.sections || []).map((s) => {
    const r = rankEntries(s.entries, (Array.isArray(ai.sections) ? ai.sections : []).find((t) => t && norm(t.title || "") === norm(s.title))?.entries, ctx, true);
    if (r.shown !== undefined) show[sectionKey(s.title)] = r.shown;
    return { ...s, entries: r.entries };
  });
  return {
    ...orig,
    summary,
    skills: [...shownSkills, ...orig.skills.filter((s) => !shownSkills.some((x) => norm(x) === norm(s)))],
    education: groundEntries(orig.education, ai.education, ctx),
    experience: groundEntries(orig.experience, ai.experience, ctx),
    projects: projects.entries,
    sections,
    additional: additional.length ? additional : orig.additional || [],
    show,
  };
}

/**
 * The user's own choices from the ATS keywords: "I have this" skills are added (to the skills line if the
 * resume does not already mention them); "leave out" skills are removed from skills and labelled lines.
 */
export function applySkillPrefs(p: Profile, prefs: { include: string[]; omit: string[] }): Profile {
  const omitted = (s: string) => prefs.omit.some((o) => norm(o) === norm(s));
  const n = p.show?.skills ?? p.skills.length;
  const shownSkills = p.skills.slice(0, n).filter((s) => !omitted(s));
  const skills = [...shownSkills, ...p.skills.slice(n).filter((s) => !omitted(s))];
  const additional = (p.additional || []).map((line) => {
    const m = line.match(/^([^:]{1,40}):\s*(.*)$/);
    if (!m) return omitted(line) ? null : line;
    const sep = m[2].includes("|") ? " | " : ", ";
    const items = m[2].split(/\s*[|,]\s*/).filter((it) => it && !omitted(it));
    return items.length ? `${m[1]}: ${items.join(sep)}` : null;
  }).filter((l): l is string => !!l);
  // Confirmed skills lead the skills line so the 18-skill cap never cuts them (except ones already on a labelled
  // line such as Soft Skills or Languages); everything else keeps its order after them.
  const isConfirmed = (x: string) => prefs.include.some((k) => norm(k) === norm(x));
  const confirmed = [...new Set(prefs.include.filter((k) => k.trim() && !omitted(k) && !additional.some((l) => inSource(k, l)))
    .map((k) => skills.find((x) => norm(x) === norm(k)) || k.trim()))];
  const shownRest = shownSkills.filter((x) => !isConfirmed(x)).length;
  return { ...p, skills: [...confirmed, ...skills.filter((x) => !isConfirmed(x))], additional, show: { ...(p.show || {}), skills: confirmed.length + shownRest } };
}

/** How much a job looks like a target title: share of the target's keywords (and title words) found in the job, plus title overlap. */
export function likeScore(job: Job, t: { title: string; keywords: string[] }): number {
  const text = [job.title, (job.skills || []).join(", "), job.requirements, job.description].join("\n");
  const words = t.title.split(/\s+/).filter((w) => w.length > 2);
  const keys = [...t.keywords, ...words];
  if (!keys.length) return 0;
  const inTitle = words.filter((w) => inSource(w, job.title)).length / Math.max(words.length, 1);
  return keys.filter((k) => inSource(k, text)).length / keys.length + inTitle;
}
