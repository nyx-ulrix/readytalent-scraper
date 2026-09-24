// Round-trip self-check for the Markdown resume template. Run: node test/markdown.test.ts
import assert from "node:assert/strict";
import { MARKER, fromMarkdown, toMarkdown } from "../src/markdown.ts";
import type { Profile } from "../src/types.ts";

const p: Profile = {
  name: "Jane Tan", email: "jane@example.com", phone: "+65 9000 0000", location: "Singapore",
  links: "https://linkedin.com/in/jane · https://github.com/jane", summary: "Engineer who ships.",
  skills: ["Python", "React", "C#"],
  education: [{ title: "Bachelor's Degree in Computer Engineering", org: "Singapore Institute of Technology | Engineering", location: "Singapore", dates: "Sept 2025 – Sept 2028", details: ["Systems design"] }],
  experience: [{ title: "Web Developer", org: "Mighty Velo", location: "Singapore", dates: "Jan 2024 – Feb 2025", details: ["Built a store: Webflow", "Ran Shopify"] }],
  projects: [{ title: "MRT Routing Optimiser", org: "Python, Dijkstra's, ACO", location: "", dates: "", details: ["O(n) pass"] }],
  awards: ["AWS Cloud Practitioner"],
  sections: [{ title: "Competition", entries: [{ title: "SMU Hackathon 2026", org: "", location: "", dates: "", details: ["Built Fitz"] }] }],
  additional: ["Soft Skills: Analytical Thinking | Communication", "Interests: Data Analytics"],
};

const md = toMarkdown(p);
assert.ok(md.startsWith(MARKER));
assert.deepEqual(fromMarkdown(md), p, "round trip preserves every field");
assert.equal(fromMarkdown("# Someone\n## Experience"), null, "non-template Markdown is left to the AI importer");

// Hand edits: CRLF, "*" bullets, a stray text line, and an unknown section become a custom section.
const edited = fromMarkdown(`${MARKER}\r\n# Jane\r\nEmail: j@x.com\r\n## Leadership\r\n### Club Lead\r\nDates: 2025\r\n* Ran events\r\nmanaged budget\r\n`);
assert.equal(edited?.email, "j@x.com");
assert.deepEqual(edited?.sections, [{ title: "Leadership", entries: [{ title: "Club Lead", org: "", location: "", dates: "2025", details: ["Ran events", "managed budget"] }] }]);
console.log("markdown self-check OK");
