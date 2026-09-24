import type { Entry, Profile } from "./types";

/**
 * AutoResume's Markdown resume template. Files that start with MARKER are parsed here exactly
 * (no AI key needed); any other Markdown resume goes through the AI importer.
 */
export const MARKER = "<!-- AutoResume template -->";

const BUILT_IN = { education: "Education", experience: "Work Experience", projects: "Projects" } as const;

function entryMd(e: Entry): string {
  const out = [`### ${e.title}`];
  if (e.org) out.push(`Org: ${e.org}`);
  if (e.location) out.push(`Location: ${e.location}`);
  if (e.dates) out.push(`Dates: ${e.dates}`);
  for (const d of e.details.filter(Boolean)) out.push(`- ${d}`);
  return out.join("\n");
}

function sectionMd(title: string, entries: Entry[]): string {
  const list = entries.filter((e) => e.title || e.org);
  return list.length ? `## ${title}\n\n${list.map(entryMd).join("\n\n")}` : "";
}

export function toMarkdown(p: Profile): string {
  const blank: Entry = { title: "Title (degree / role / project name)", org: "School, company or tech stack", location: "Singapore", dates: "Jan 2024 – Present", details: ["What you did and the result"] };
  const or = (list: Entry[]) => (list.some((e) => e.title || e.org) ? list : [blank]);
  const parts = [
    MARKER,
    `# ${p.name || "Your Name"}`,
    [`Email: ${p.email}`, `Phone: ${p.phone}`, `Location: ${p.location}`, `Links: ${p.links}`].join("\n"),
    `## Summary\n\n${p.summary}`,
    sectionMd(BUILT_IN.education, or(p.education)),
    sectionMd(BUILT_IN.experience, or(p.experience)),
    sectionMd(BUILT_IN.projects, or(p.projects)),
    ...(p.sections || []).map((s) => sectionMd(s.title, s.entries)),
    `## Certifications\n\n${p.awards.filter(Boolean).map((a) => `- ${a}`).join("\n")}`,
    `## Skills\n\n${[`Technical Skills: ${p.skills.join(" | ")}`, ...(p.additional || []).filter(Boolean)].join("\n")}`,
  ];
  return parts.filter(Boolean).join("\n\n") + "\n";
}

/** Parse a file produced by toMarkdown (possibly hand-edited). Returns null if it is not in the template format. */
export function fromMarkdown(md: string): Profile | null {
  if (!md.trimStart().startsWith(MARKER)) return null;
  const p: Profile = { name: "", email: "", phone: "", location: "", links: "", summary: "", skills: [], experience: [], education: [], projects: [], awards: [], sections: [], additional: [] };
  let section = "";
  let entries: Entry[] | null = null;
  let entry: Entry | null = null;
  const summary: string[] = [];
  const kv = (line: string) => line.match(/^(Email|Phone|Location|Links|Org|Dates):\s*(.*)$/i);

  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line === MARKER) continue;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^#\s+(.*)$/))) { p.name = m[1].trim(); continue; }
    if ((m = line.match(/^##\s+(.*)$/))) {
      section = m[1].trim(); entry = null;
      const key = section.toLowerCase();
      if (key === "education") entries = p.education;
      else if (key === "work experience" || key === "experience") entries = p.experience;
      else if (key === "projects") entries = p.projects;
      else if (/^(summary|profile|skills|certifications|awards)/.test(key)) entries = null;
      else { const s = { title: section, entries: [] as Entry[] }; p.sections.push(s); entries = s.entries; }
      continue;
    }
    const key = section.toLowerCase();
    if (!section) {
      if ((m = kv(line))) { const k = m[1].toLowerCase() as "email" | "phone" | "location" | "links"; if (k in p) p[k] = m[2].trim(); }
      continue;
    }
    if (key === "summary" || key === "profile") { summary.push(line); continue; }
    if (key.startsWith("certifications") || key === "awards") { p.awards.push(line.replace(/^[-*]\s+/, "")); continue; }
    if (key === "skills") {
      if ((m = line.match(/^technical skills:\s*(.*)$/i))) p.skills = m[1].split(/\s*[|,]\s*/).filter(Boolean);
      else p.additional.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }
    if (!entries) continue;
    if ((m = line.match(/^###\s+(.*)$/))) { entry = { title: m[1].trim(), org: "", location: "", dates: "", details: [] }; entries.push(entry); continue; }
    if (!entry) continue;
    if ((m = line.match(/^[-*]\s+(.*)$/))) { entry.details.push(m[1].trim()); continue; }
    if ((m = line.match(/^Location:\s*(.*)$/i))) { entry.location = m[1].trim(); continue; }
    if ((m = kv(line))) { const k = m[1].toLowerCase(); if (k === "org") entry.org = m[2].trim(); else if (k === "dates") entry.dates = m[2].trim(); continue; }
    entry.details.push(line); // stray text line: keep it as a bullet rather than drop it
  }
  p.summary = summary.join(" ");
  return p;
}
