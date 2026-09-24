/**
 * Turns emails, URLs, bare domains (liewjiaen.com, github.com/you) and, when asked, phone numbers into
 * real <a> links, so the exported PDF (Chromium printToPDF / browser print) has clickable links.
 * Bare domains must be lowercase with a known TLD so "ASP.NET" or "Node.js" stay plain text.
 */
const TLDS = "com|sg|io|dev|net|org|app|me|ai|co|edu|gov|xyz|tech|site|page|info|biz|uk|my|au|in|ly|gg|so|to|cc";
const PATTERN = new RegExp(
  [
    String.raw`[\w.+-]+@[\w-]+(?:\.[\w-]+)+`, // email
    String.raw`https?:\/\/[^\s<>()]+`, // full URL
    String.raw`www\.[^\s<>()]+`, // www.
    String.raw`(?<![\w@./-])(?:[a-z0-9-]+\.)+(?:${TLDS})(?:\/[^\s<>()]*)?(?![\w-])`, // bare domain, lowercase only
  ].join("|"),
  "g",
);
export const PHONE = /^\+?[\d\s()-]{7,}$/;

export function hrefFor(text: string): string {
  if (/^[\w.+-]+@/.test(text)) return `mailto:${text}`;
  if (/^https?:\/\//i.test(text)) return text;
  return `https://${text}`;
}

/** Split text into plain strings and link targets; trailing punctuation stays outside the link. */
export function linkParts(text: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    let hit = m[0];
    const trail = hit.match(/[.,;:!?'"\]]+$/);
    if (trail) hit = hit.slice(0, -trail[0].length);
    const start = m.index!;
    if (start > last) out.push({ text: text.slice(last, start) });
    out.push({ text: hit, href: hrefFor(hit) });
    last = start + hit.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}


/** Sort a free-text links string ("site · linkedin · github") into the header fields. */
export function splitLinks(links: string): { portfolio: string; linkedin: string; github: string; links: string } {
  const out = { portfolio: "", linkedin: "", github: "", links: "" };
  const rest: string[] = [];
  for (const raw of links.split(/\s*[·•|,]\s*|\s{2,}/).map((x) => x.trim()).filter(Boolean)) {
    if (!out.linkedin && /linkedin\.com/i.test(raw)) out.linkedin = raw;
    else if (!out.github && /^(https?:\/\/)?(www\.)?github\.com\/[^/\s]+\/?$/i.test(raw)) out.github = raw;
    else if (!out.portfolio && !/linkedin\.com|github\.com/i.test(raw)) out.portfolio = raw;
    else rest.push(raw);
  }
  out.links = rest.join(" · ");
  return out;
}

/** Header link list in display order: portfolio, LinkedIn, GitHub, then any others. */
export const headerLinks = (p: { portfolio?: string; linkedin?: string; github?: string; links?: string }) =>
  [p.portfolio, p.linkedin, p.github, ...(p.links || "").split(/\s*[·•|,]\s*|\s{2,}/)].map((x) => (x || "").trim()).filter(Boolean);
