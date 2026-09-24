import type { Entry, Profile } from "./types";

/**
 * Deterministic guard run after every AI rewrite: the output may only contain facts from the
 * candidate's own source text (their resume + the notes they typed). The AI rewords; this file
 * makes sure nothing new slips through:
 * - contact details, entry titles/orgs/locations/dates, awards and section names are pinned to the original;
 * - entries the AI invented are dropped, entries it lost come back;
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

function groundEntries(orig: Entry[], ai: Entry[] | undefined, source: string): Entry[] {
  const list = Array.isArray(ai) ? ai : [];
  return orig.map((o, i) => {
    const a = list.find((x) => x && norm(x.title || "") === norm(o.title) && norm(x.org || "") === norm(o.org)) ?? list[i];
    const aiDetails = Array.isArray(a?.details) ? a!.details.map(String).filter((d) => d.trim()) : [];
    // Unsupported bullet -> the original bullet in the same slot (or dropped if there is none).
    const details = aiDetails.map((d, j) => (numbersSupported(d, source) ? d : o.details[j])).filter((d): d is string => !!d);
    return { ...o, details: details.length ? details : o.details };
  });
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
  const skills = (Array.isArray(ai.skills) ? ai.skills.map(String) : []).filter((s) => inSource(s, source));
  const additional = (Array.isArray(ai.additional) ? ai.additional.map(String) : orig.additional || [])
    .map((l) => groundLine(l, source)).filter((l): l is string => !!l);
  const summary = typeof ai.summary === "string" && numbersSupported(ai.summary, source) ? ai.summary : orig.summary;
  return {
    ...orig,
    summary,
    skills: skills.length ? [...new Set(skills)] : orig.skills,
    education: groundEntries(orig.education, ai.education, source),
    experience: groundEntries(orig.experience, ai.experience, source),
    projects: groundEntries(orig.projects, ai.projects, source),
    sections: (orig.sections || []).map((s) => ({
      ...s,
      entries: groundEntries(s.entries, (Array.isArray(ai.sections) ? ai.sections : []).find((t) => t && norm(t.title || "") === norm(s.title))?.entries, source),
    })),
    additional: additional.length ? additional : orig.additional || [],
  };
}

/**
 * The user's own choices from the ATS keywords: "I have this" skills are added (to the skills line if the
 * resume does not already mention them); "leave out" skills are removed from skills and labelled lines.
 */
export function applySkillPrefs(p: Profile, prefs: { include: string[]; omit: string[] }): Profile {
  const omitted = (s: string) => prefs.omit.some((o) => norm(o) === norm(s));
  const skills = p.skills.filter((s) => !omitted(s));
  const additional = (p.additional || []).map((line) => {
    const m = line.match(/^([^:]{1,40}):\s*(.*)$/);
    if (!m) return omitted(line) ? null : line;
    const sep = m[2].includes("|") ? " | " : ", ";
    const items = m[2].split(/\s*[|,]\s*/).filter((it) => it && !omitted(it));
    return items.length ? `${m[1]}: ${items.join(sep)}` : null;
  }).filter((l): l is string => !!l);
  const text = [p.summary, skills.join(" | "), additional.join("\n"), ...[...p.experience, ...p.projects, ...p.education, ...(p.sections || []).flatMap((x) => x.entries)].flatMap((e) => e.details)].join("\n");
  const missing = prefs.include.filter((k) => k.trim() && !omitted(k) && !inSource(k, text));
  return { ...p, skills: [...skills, ...missing], additional };
}
