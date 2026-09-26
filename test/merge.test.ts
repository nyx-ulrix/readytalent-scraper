// Self-check for merging new details into existing ones. Run: node test/merge.test.ts
import assert from "node:assert/strict";
import { mergeProfile, mergeSummary } from "../src/merge.ts";
import type { Profile } from "../src/types.ts";

const e = (title: string, org: string, details: string[], dates = "") => ({ title, org, location: "", dates, details });
const cur: Profile = {
  name: "Jane Tan", email: "jane@example.com", phone: "", location: "Singapore", portfolio: "", linkedin: "", github: "", links: "", summary: "Engineer.",
  skills: ["Python", "React"],
  experience: [e("Web Developer", "Mighty Velo", ["Designed and deployed an e-commerce platform using Webflow with designers."], "Jan 2024 – Feb 2025")],
  education: [e("Bachelor's Degree in Computer Engineering", "Singapore Institute of Technology", ["Relevant modules: DSA"])],
  projects: [e("Deployer", "Node.js", ["Built a self-hosted deployment platform."])],
  awards: ["AWS Cloud Practitioner"],
  sections: [{ title: "Leadership & Co-Curricular Activities", entries: [e("Logistics, SIT FoodieConnect", "SIT", ["Led a team of 12."])] }],
  additional: ["Soft Skills: Teamwork | Communication"],
};
const inc: Partial<Profile> = {
  name: "Someone Else", phone: "+65 9000 0000", summary: "A different summary.",
  skills: ["python", "Docker"],
  experience: [
    e("Web Developer", "Mighty Velo · Singapore", ["Designed, built and deployed an e-commerce platform using Webflow with designers.", "Managed Shopify listings and catalogue updates."]),
    e("Forward Deployed Engineer (Part-time)", "HiLite", ["Built AI chatbots for clients."], "2026 – Present"),
  ],
  education: [e("Bachelor of Engineering in Computer Engineering", "Singapore Institute of Technology", ["Relevant modules: DSA"])],
  projects: [e("Badnotes", "Android", ["Note-taking app with Google Drive sync."])],
  awards: ["AWS Cloud Practitioner"],
  sections: [{ title: "Leadership and Co-Curricular Activities", entries: [e("SIT FoodieConnect, Logistics", "SIT", ["Planned monthly events for 500+ members."]), e("Emcee, Graduation Party", "Jia Ying", ["Co-emceed for 300 seniors."])] }],
  additional: ["Soft Skills: Communication | Public Speaking", "Languages: English | Mandarin"],
};
const { profile: m, added } = mergeProfile(cur, inc);
assert.equal(m.name, "Jane Tan", "existing contact details are never overwritten");
assert.equal(m.phone, "+65 9000 0000", "empty ones are filled");
assert.equal(m.summary, "Engineer.");
assert.deepEqual(m.skills, ["Python", "React", "Docker"]);
assert.equal(m.experience.length, 2, "new job added, same job matched");
assert.deepEqual(m.experience[0].details, ["Designed and deployed an e-commerce platform using Webflow with designers.", "Managed Shopify listings and catalogue updates."], "reworded bullet not duplicated; new bullet added");
assert.equal(m.experience[0].org, "Mighty Velo", "your wording kept");
assert.equal(m.experience[1].title, "Forward Deployed Engineer (Part-time)");
assert.equal(m.education.length, 1, "same degree matched by school");
assert.deepEqual(m.projects.map((p) => p.title), ["Deployer", "Badnotes"]);
assert.equal(m.sections.length, 1, "same section under a slightly different name");
assert.deepEqual(m.sections[0].entries.map((x) => x.title), ["Logistics, SIT FoodieConnect", "Emcee, Graduation Party"]);
assert.deepEqual(m.sections[0].entries[0].details, ["Led a team of 12.", "Planned monthly events for 500+ members."]);
assert.deepEqual(m.awards, ["AWS Cloud Practitioner"]);
assert.deepEqual(m.additional, ["Soft Skills: Teamwork | Communication | Public Speaking", "Languages: English | Mandarin"]);
assert.deepEqual(added, { entries: 3, bullets: 2, skills: 1, other: 2 });
assert.equal(mergeSummary(added), "3 new entries, 2 new bullet points, 1 skill, 2 other items");
assert.equal(mergeSummary(mergeProfile(m, inc).added), "nothing new", "merging the same thing twice adds nothing");
const combined = mergeProfile(m, { experience: [e("Web Developer", "", ["Designed and deployed an e-commerce platform using Webflow with designers, and managed Shopify listings and catalogue updates."])] });
assert.equal(combined.added.bullets, 0, "a rewording that combines two existing bullets is not added");
console.log("merge self-check OK");
