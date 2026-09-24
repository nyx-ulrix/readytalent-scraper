// Self-check for the grounding guard. Run: node test/ground.test.ts
import assert from "node:assert/strict";
import { applySkillPrefs, groundProfile, inSource, numbersSupported } from "../src/ground.ts";
import { toMarkdown } from "../src/markdown.ts";
import type { Profile } from "../src/types.ts";

const orig: Profile = {
  name: "Jane Tan", email: "jane@example.com", phone: "+65 9000 0000", location: "Singapore", portfolio: "", linkedin: "", github: "", links: "", summary: "Engineer.",
  skills: ["Python", "React"],
  education: [{ title: "BEng Computer Engineering", org: "SIT", location: "Singapore", dates: "2025 – 2028", details: ["Systems design"] }],
  experience: [{ title: "Web Developer", org: "Mighty Velo", location: "Singapore", dates: "Jan 2024 – Feb 2025", details: ["Built a Webflow store for 60 products", "Ran Shopify"] }],
  projects: [], awards: ["AWS Cloud Practitioner"],
  sections: [{ title: "Leadership", entries: [{ title: "Club Lead", org: "SIT", location: "", dates: "2025", details: ["Led a workshop for 60 participants"] }] }],
  additional: ["Soft Skills: Teamwork | Communication"],
};
const source = toMarkdown(orig, false) + "\n## Notes from the candidate\n\nI speak English and Mandarin fluently. Comfortable presenting to clients.";

assert.ok(numbersSupported("Delivered for 60 participants in 2025", source));
assert.ok(!numbersSupported("Cut load time by 40%", source));
assert.ok(inSource("mandarin", source) && inSource("Python", source) && !inSource("Java", "JavaScript, C#") && inSource("C#", "JavaScript, C#"));

const ai = {
  name: "Someone Else", summary: "Engineer who boosted revenue 30%.",
  skills: ["React", "Python", "Kubernetes", "Mandarin"],
  education: [{ title: "BEng Computer Engineering", org: "SIT", location: "Singapore", dates: "2020 – 2028", details: ["Applied systems design to real products"] }],
  experience: [
    { title: "Web Developer", org: "Mighty Velo", location: "Remote", dates: "2023", details: ["Collaborated with designers to build a Webflow store for 60 products", "Grew sales 3x through Shopify"] },
    { title: "CTO", org: "Invented Corp", location: "", dates: "", details: ["Led 50 engineers"] },
  ],
  sections: [{ title: "Leadership", entries: [] }, { title: "Made Up", entries: [{ title: "x", org: "", location: "", dates: "", details: ["y"] }] }],
  additional: ["Soft Skills: Teamwork | Negotiation | Communication", "Languages: English | Mandarin | French", "Interests: Skydiving"],
} as unknown as Partial<Profile>;

const g = groundProfile(orig, ai, source);
assert.equal(g.name, "Jane Tan", "contact details pinned");
assert.equal(g.summary, "Engineer.", "summary with an invented number reverts");
assert.deepEqual(g.skills, ["React", "Python", "Mandarin"], "skills must appear in the source; reordering and notes-based skills allowed");
assert.equal(g.education[0].dates, "2025 – 2028", "dates pinned");
assert.deepEqual(g.education[0].details, ["Applied systems design to real products"], "rewording without new numbers is kept");
assert.equal(g.experience.length, 1, "invented employer dropped");
assert.equal(g.experience[0].location, "Singapore", "location pinned");
assert.deepEqual(g.experience[0].details, ["Collaborated with designers to build a Webflow store for 60 products", "Ran Shopify"], "bullet with invented metric reverts to the original bullet");
assert.deepEqual(g.sections, orig.sections, "a section the AI emptied falls back to its first entries; invented sections dropped");
assert.deepEqual(g.additional, ["Soft Skills: Teamwork | Communication", "Languages: English | Mandarin"], "labelled items must appear in the source");
assert.deepEqual(g.awards, orig.awards);
// User skill choices from ATS keywords: add confirmed ones not yet mentioned, strip left-out ones.
const withPrefs = applySkillPrefs(g, { include: ["Docker", "React", "SQL"], omit: ["Python", "Communication"] });
assert.deepEqual(withPrefs.skills, ["React", "Mandarin", "Docker", "SQL"], "confirmed skills appended once, left-out skill removed");
assert.deepEqual(withPrefs.additional, ["Soft Skills: Teamwork", "Languages: English | Mandarin"], "left-out items removed from labelled lines");
assert.deepEqual(applySkillPrefs(g, { include: ["Python"], omit: ["Python"] }).skills, ["React", "Mandarin"], "leave-out wins over include");
// Projects: the AI's choice and order (most relevant first), capped at 3; invented ones ignored.
const proj = (t: string) => ({ title: t, org: "Python", location: "", dates: "", details: [t + " work"] });
const many = { ...orig, projects: ["A", "B", "C", "D", "E"].map(proj), sections: [{ title: "Leadership & Co-Curricular Activities", entries: ["L1", "L2", "L3"].map(proj) }] };
const picked = groundProfile(many, { projects: ["D", "Invented", "B", "E", "A"].map(proj), sections: [{ title: "Leadership & Co-Curricular Activities", entries: ["L3", "L1", "L2"].map(proj) }] } as Partial<Profile>, source);
assert.deepEqual(picked.projects.map((p) => p.title), ["D", "B", "E"], "top 3 in the AI's relevance order");
assert.deepEqual(picked.sections[0].entries.map((e) => e.title), ["L3", "L1"], "at most 2 leadership entries, most relevant first");
assert.deepEqual(groundProfile(many, {} as Partial<Profile>, source).projects.map((p) => p.title), ["A", "B", "C"], "garbled output falls back to the first 3");
console.log("ground self-check OK");
