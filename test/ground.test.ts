// Self-check for the grounding guard. Run: node test/ground.test.ts
import assert from "node:assert/strict";
import { applySkillPrefs, groundProfile, inSource, numbersSupported } from "../src/ground.ts";
import { byRank, visible, withStored } from "../src/limits.ts";
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
assert.deepEqual(g.skills, ["React", "Python"], "skills must appear in the source; Mandarin stays on the Languages line, not repeated here");
assert.equal(g.education[0].dates, "2025 – 2028", "dates pinned");
assert.deepEqual(g.education[0].details, ["Applied systems design to real products"], "rewording without new numbers is kept");
assert.equal(g.experience.length, 1, "invented employer dropped");
assert.equal(g.experience[0].location, "Singapore", "location pinned");
assert.deepEqual(g.experience[0].details, ["Collaborated with designers to build a Webflow store for 60 products", "Ran Shopify"], "bullet with invented metric reverts to the original bullet");
assert.deepEqual(g.sections, orig.sections, "entries stay stored; invented sections dropped");
assert.deepEqual(visible(g).sections[0].entries, [], "a section the AI deliberately emptied shows nothing");
assert.deepEqual(groundProfile(orig, { sections: [] } as Partial<Profile>, source).sections, orig.sections, "a section missing from the output falls back to the original");
assert.deepEqual(g.additional, ["Soft Skills: Teamwork | Communication", "Languages: English | Mandarin"], "labelled items must appear in the source");
assert.deepEqual(g.awards, orig.awards);
// User skill choices from ATS keywords: add confirmed ones not yet mentioned, strip left-out ones.
const withPrefs = applySkillPrefs(g, { include: ["Docker", "React", "SQL"], omit: ["Python", "Communication"] });
assert.deepEqual(withPrefs.skills, ["React", "Docker", "SQL"], "confirmed skills added once, left-out skill removed");
assert.deepEqual(visible(withPrefs).skills, ["React", "Docker", "SQL"], "confirmed skills are shown");
assert.deepEqual(withPrefs.additional, ["Soft Skills: Teamwork", "Languages: English | Mandarin"], "left-out items removed from labelled lines");
assert.deepEqual(applySkillPrefs(g, { include: ["Python"], omit: ["Python"] }).skills, ["React"], "leave-out wins over include");
// Projects: the AI's choice and order (most relevant first), capped at 3; invented ones ignored.
const proj = (t: string) => ({ title: t, org: "Python", location: "", dates: "", details: [t + " work"] });
const many = { ...orig, projects: ["A", "B", "C", "D", "E"].map(proj), sections: [{ title: "Leadership & Co-Curricular Activities", entries: ["L1", "L2", "L3"].map(proj) }] };
const picked = groundProfile(many, { projects: ["D", "Invented", "B", "E", "A"].map(proj), sections: [{ title: "Leadership & Co-Curricular Activities", entries: ["L3", "L1", "L2"].map(proj) }] } as Partial<Profile>, source);
assert.deepEqual(picked.projects.map((p) => p.title), ["D", "B", "E", "A", "C"], "all stored: AI's picks first, the rest after");
assert.deepEqual(visible(picked).projects.map((p) => p.title), ["D", "B", "E"], "page shows the top 3");
assert.deepEqual(visible(picked).sections[0].entries.map((e) => e.title), ["L3", "L1"], "at most 2 leadership entries, most relevant first");
assert.equal(picked.sections[0].entries.length, 3, "all leadership entries stored");
const two2 = groundProfile(many, { projects: ["C", "A"].map(proj) } as Partial<Profile>, source);
assert.deepEqual(visible(two2).projects.map((p) => p.title), ["C", "A"], "AI picked 2: page shows 2");
assert.deepEqual(visible(groundProfile(many, {} as Partial<Profile>, source)).projects.map((p) => p.title), ["A", "B", "C"], "garbled output falls back to the first 3");
// Ranking only reorders; old tailored versions get the rest stored underneath.
assert.deepEqual(byRank(["a", "b", "c", "d"], ["C", "x", "A"], (s) => s), ["c", "a", "b", "d"]);
const old = withStored({ ...many, projects: [proj("D")], sections: [{ title: "Leadership & Co-Curricular Activities", entries: [] }], show: undefined }, many);
assert.deepEqual(old.projects.map((p) => p.title), ["D", "A", "B", "C", "E"]);
assert.deepEqual(visible(old).projects.map((p) => p.title), ["D"]);
assert.deepEqual(visible(old).sections[0].entries, []);
// A bullet from another entry must not land under this one (the robot-car bullet under a web app, "300 seniors" under another event).
const two = {
  ...orig,
  projects: [
    { title: "Fitz", org: "React, Vite", location: "", dates: "", details: ["Built a wardrobe web app deployed on Vercel."] },
    { title: "Yahboom Robot", org: "Python, ROS 2", location: "", dates: "", details: ["Developed a robotics stack with a Flask backend for a Yahboom robot car."] },
  ],
  sections: [{ title: "Leadership & Co-Curricular Activities", entries: [
    { title: "Emcee, Guitar Ensemble", org: "SIT", location: "", dates: "Oct 2026", details: ["Selected as one of two emcees for a three-hour recital."] },
    { title: "Emcee, Graduation Party", org: "Jia Ying", location: "", dates: "Jul 2026", details: ["Co-emceed a celebration for approximately 300 seniors."] },
  ] }],
};
const mixed = groundProfile(two, {
  projects: [
    { title: "Fitz", org: "React, Vite", details: ["Developed a robotics stack with a Flask backend for a Yahboom robot car.", "Shipped a mobile-first React app."] },
    { title: "Yahboom Robot", org: "Python, ROS 2", details: ["Built a ROS 2 robotics stack for a Yahboom robot car."] },
  ],
  sections: [{ title: "Leadership & Co-Curricular Activities", entries: [
    { title: "Emcee, Guitar Ensemble", org: "SIT", details: ["Co-emceed a celebration for approximately 300 seniors."] },
  ] }],
} as unknown as Partial<Profile>, toMarkdown(two, false));
assert.deepEqual(mixed.projects[0].details, ["Built a wardrobe web app deployed on Vercel.", "Shipped a mobile-first React app."], "Yahboom bullet rejected under Fitz; its own rewrite kept");
assert.deepEqual(mixed.projects[1].details, ["Built a ROS 2 robotics stack for a Yahboom robot car."], "the robot's own rewrite is fine");
assert.deepEqual(mixed.sections[0].entries[0].details, ["Selected as one of two emcees for a three-hour recital."], "a number from another event is rejected");
// Soft skills / languages are not repeated in Technical Skills.
const dup = groundProfile(orig, { skills: ["React", "Teamwork", "Mandarin"], additional: ["Soft Skills: Teamwork", "Languages: English | Mandarin"] } as Partial<Profile>, source);
assert.deepEqual(visible(dup).skills, ["React"]);
assert.deepEqual(dup.skills, ["React", "Python"], "your other skills stay stored");
console.log("ground self-check OK");

// "Most like" sort for a target title: closer matches score higher.
{
  const { likeScore } = await import("../src/ground.ts");
  const t = { title: "Forward Deployed Engineer", keywords: ["Python", "APIs", "customer", "deployment"] };
  const job = (title: string, description: string) => ({ id: title, title, description, skills: [], requirements: "" }) as unknown as Parameters<typeof likeScore>[0];
  const fde = likeScore(job("Forward Deployed Engineer", "Work with customer teams on deployment of Python APIs."), t);
  const se = likeScore(job("Solutions Engineer", "Customer deployment of Python services and APIs."), t);
  const chef = likeScore(job("Line Cook", "Prepare meals."), t);
  assert.ok(fde > se && se > chef, `${fde} > ${se} > ${chef}`);
  assert.equal(chef, 0);
}

// "Only if very relevant" entries never reach the base resume; a tailored one shows what the AI picked.
{
  const { visible } = await import("../src/limits.ts");
  const e = (t: string, low = false) => ({ title: t, org: "", location: "", dates: "", details: ["x"], ...(low ? { onlyIfVeryRelevant: true } : {}) });
  const p = { ...orig, projects: [e("A"), e("B", true), e("C"), e("D")] };
  assert.deepEqual(visible(p).projects.map((x) => x.title), ["A", "C", "D"], "base resume skips it");
  assert.deepEqual(visible({ ...p, show: { projects: 2 } }).projects.map((x) => x.title), ["A", "B"], "tailored: the AI's pick stands");
}
