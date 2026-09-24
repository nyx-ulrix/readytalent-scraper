// Self-check for link detection on resumes. Run: node test/linkify.test.ts
import assert from "node:assert/strict";
import { headerLinks, hrefFor, linkParts, splitLinks } from "../src/links.ts";

const links = (t: string) => linkParts(t).filter((p) => p.href).map((p) => p.href);
assert.deepEqual(links("malcolmliew.je@gmail.com"), ["mailto:malcolmliew.je@gmail.com"]);
assert.deepEqual(links("https://www.linkedin.com/in/malcolmliewjiaen/"), ["https://www.linkedin.com/in/malcolmliewjiaen/"]);
assert.deepEqual(links("liewjiaen.com"), ["https://liewjiaen.com"]);
assert.deepEqual(links("Memo App (Flutter): mobile memos. (https://github.com/nyx-ulrix/memo_app)"), ["https://github.com/nyx-ulrix/memo_app"], "URL in brackets, bracket not included");
assert.deepEqual(links("See github.com/nyx-ulrix."), ["https://github.com/nyx-ulrix"], "trailing full stop stays outside");
assert.deepEqual(links("Built with ASP.NET, Node.js and Vue.js"), [], "tech names are not links");
assert.deepEqual(links("Python | HTML/CSS | C#"), []);
assert.equal(linkParts("a b.com c").map((p) => p.text).join(""), "a b.com c", "text is preserved exactly");
assert.equal(hrefFor("www.example.com"), "https://www.example.com");
assert.deepEqual(splitLinks("liewjiaen.com • https://www.linkedin.com/in/malcolmliewjiaen/ • https://github.com/nyx-ulrix"),
  { portfolio: "liewjiaen.com", linkedin: "https://www.linkedin.com/in/malcolmliewjiaen/", github: "https://github.com/nyx-ulrix", links: "" });
assert.deepEqual(splitLinks("https://github.com/nyx-ulrix/memo_app · https://github.com/nyx-ulrix").github, "https://github.com/nyx-ulrix", "a repo link is not the profile");
assert.deepEqual(headerLinks({ portfolio: "a.com", linkedin: "", github: "https://github.com/x", links: "b.io · c.dev" }), ["a.com", "https://github.com/x", "b.io", "c.dev"]);
console.log("linkify self-check OK");
