import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Entry, Profile, Template } from "./types";
import { Linkify } from "./linkify";
import { headerLinks } from "./links";
import { spareProjects, visible } from "./limits";

/** Smallest text allowed on a resume or letter. */
/** Tailored resumes may run to this many A4 pages. */
export const TAILORED_PAGES = 2;
export const MIN_FONT_PT = 8;
const PT_TO_PX = 96 / 72;

/** What the fitting did, for the note on the Resume tab. */
/**
 * `pages`: how many A4 pages a flowing resume runs to; `maxPages`: its limit (tailored resumes: 2; the base resume has
 * none); `lastFill`: how full the last page is (0..1); `extraProjects`: stored projects added to fill page 2.
 */
export type FitInfo = { scale: number; smallestPt: number; hiddenBullets: number; tight: boolean; fits: boolean; pages?: number; maxPages?: number; lastFill?: number; extraProjects?: number };

/**
 * Exactly one A4 sheet. If the content is taller than the page, everything inside is scaled down evenly
 * (text, spacing, headings), but never so far that the smallest text drops below MIN_FONT_PT.
 * The width is compensated so lines still span the full page. Reports whether it fits at that limit.
 */
function A4({ className, fitKey, onFit, children, multi = false, maxPages }: { className: string; fitKey: string; onFit?: (r: { scale: number; smallestPt: number; fits: boolean; pages?: number; maxPages?: number; lastFill?: number }) => void; children: ReactNode; multi?: boolean; maxPages?: number }) {
  const area = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const fit = () => {
      const a = area.current, b = body.current;
      if (!a || !b) return;
      b.style.zoom = "";
      const room = a.getBoundingClientRect().height * 0.995; // tiny margin so print rounding never spills
      const at = (f: number) => {
        b.style.transform = f === 1 ? "" : `scale(${f})`;
        b.style.width = `${100 / f}%`;
        return b.getBoundingClientRect().height;
      };
      // Smallest font actually used on this page (unscaled), so the floor works for every template.
      at(1);
      let smallestPx = Infinity;
      for (const el of b.querySelectorAll<HTMLElement>("*")) {
        if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())) continue;
        smallestPx = Math.min(smallestPx, parseFloat(getComputedStyle(el).fontSize) || Infinity);
      }
      const minScale = Math.min(1, (MIN_FONT_PT * PT_TO_PX) / (smallestPx === Infinity ? MIN_FONT_PT * PT_TO_PX : smallestPx));
      if (multi) {
        // Flows over A4 pages (265 mm of text per page). The base resume is never shrunk; a tailored one is shrunk
        // (never below MIN_FONT_PT) to stay within maxPages. CSS zoom, unlike a transform, changes the layout, so
        // the printed page breaks match.
        // 265 mm of text per page, measured at the same on-screen zoom as the content (the preview zooms the page to
        // fit the window), so on-screen measurements match the printed layout.
        const sheet = a.parentElement!.getBoundingClientRect().width / ((210 * 96) / 25.4);
        const perPage = ((265 * 96) / 25.4) * (sheet || 1);
        const zoomed = (f: number) => { b.style.transform = ""; b.style.width = ""; b.style.zoom = f === 1 ? "" : String(f); return paginate(b, perPage); };
        let f = 1;
        let laid = zoomed(1);
        let fits = true;
        if (maxPages) {
          fits = laid.pages <= maxPages;
          if (!fits) {
            fits = zoomed(minScale).pages <= maxPages;
            if (fits) {
              let lo = minScale, hi = 1;
              for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (zoomed(mid).pages <= maxPages) lo = mid; else hi = mid; }
              f = lo;
            } else f = minScale;
            laid = zoomed(f);
          }
        }
        onFit?.({ scale: f, smallestPt: (smallestPx === Infinity ? MIN_FONT_PT * PT_TO_PX : smallestPx) / PT_TO_PX * f, fits, pages: laid.pages, maxPages, lastFill: laid.lastFill });
        return;
      }
      let f = 1;
      let fits = at(1) <= room;
      if (!fits) {
        fits = at(minScale) <= room;
        if (fits) {
          let lo = minScale, hi = 1;
          for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (at(mid) <= room) lo = mid; else hi = mid; }
          f = lo;
        } else f = minScale;
        at(f);
      }
      onFit?.({ scale: f, smallestPt: (smallestPx / PT_TO_PX) * f, fits });
    };
    fit();
    void document.fonts?.ready.then(fit); // refit once web fonts have loaded
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={className}>
      <div className="page-area" ref={area}><div className="page-fit" ref={body}>{children}</div></div>
    </div>
  );
}

/**
 * Count pages the way the printer lays them out: an entry (or the header) is never split across pages, so if it
 * doesn't fit in what's left of a page it moves to the next one, leaving a gap; a heading stays with what follows it.
 * Measuring total height alone undercounts, which let a "2 page" resume print onto a third page.
 */
function paginate(root: HTMLElement, perPage: number): { pages: number; lastFill: number } {
  const page = perPage * 0.985; // a little slack for print rounding
  const origin = root.getBoundingClientRect().top;
  const blocks: { top: number; bottom: number; atomic: boolean }[] = [];
  const add = (els: Element[], atomic: boolean) => {
    const rs = els.map((e) => e.getBoundingClientRect()).filter((r) => r.height > 0);
    if (rs.length) blocks.push({ top: Math.min(...rs.map((r) => r.top)) - origin, bottom: Math.max(...rs.map((r) => r.bottom)) - origin, atomic });
  };
  for (const child of Array.from(root.children)) {
    if (child.tagName !== "SECTION") { add([child], true); continue; }
    const kids = Array.from(child.children);
    const head = kids[0]?.tagName === "H2" ? kids.shift()! : null;
    if (!kids.length && head) add([head], true);
    // The heading travels with the first item; entries and lists stay whole; plain paragraphs may split.
    kids.forEach((k, i) => add(i === 0 && head ? [head, k] : [k], i === 0 || k.classList.contains("entry") || k.tagName === "UL" || k.classList.contains("line-plain")));
  }
  let pages = 1, start = 0, shift = 0;
  for (const b of blocks) {
    const top = b.top + shift, bottom = b.bottom + shift;
    if (bottom <= start + page) continue;
    if (b.atomic && bottom - top <= page && top > start) { shift += start + page - top; start += page; pages++; } // move it to the next page
    else while (bottom > start + page) { start += page; pages++; } // too tall to keep whole: it splits
  }
  const end = (blocks.length ? blocks[blocks.length - 1].bottom : 0) + shift;
  return { pages, lastFill: Math.max(0, Math.min(1, (end - start) / page)) };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

const bullets = (e: Entry) => e.details.filter(Boolean);

/**
 * Steps tried in order until the page fits at 8 pt or larger: normal, tighter spacing, then fewer bullets per
 * entry. Nothing is deleted from your data; hidden bullets are only left off this page.
 */
const DENSITY: { tight: boolean; bullets: number }[] = [
  { tight: false, bullets: Infinity }, { tight: true, bullets: Infinity },
  { tight: true, bullets: 4 }, { tight: true, bullets: 3 }, { tight: true, bullets: 2 }, { tight: true, bullets: 1 }, { tight: true, bullets: 0 },
];
const hiddenCount = (p: Profile, cap: number) =>
  [...p.education, ...p.experience, ...p.projects, ...(p.sections || []).flatMap((s) => s.entries)]
    .reduce((n, e) => n + Math.max(0, bullets(e).length - cap), 0);

/** Picks the first density step that fits; resets when the content or template changes. */
function useDensity(key: string, onFit?: (info: FitInfo) => void) {
  const [level, setLevel] = useState(0);
  useEffect(() => setLevel(0), [key]);
  const report = (p: Profile | null) => (r: { scale: number; smallestPt: number; fits: boolean; pages?: number; maxPages?: number; lastFill?: number }) => {
    if (!r.fits && level < DENSITY.length - 1) { setLevel(level + 1); return; }
    const d = DENSITY[level];
    onFit?.({ scale: r.scale, smallestPt: r.smallestPt, fits: r.fits, tight: d.tight, hiddenBullets: p ? hiddenCount(p, d.bullets) : 0, pages: r.pages, maxPages: r.maxPages, lastFill: r.lastFill });
  };
  return { level, d: DENSITY[level], report };
}
const hasEntries = (items: Entry[]) => items.some((e) => e.title || e.org);

/** Classic / modern / compact entry: title + dates, then org · location, then bullets. */
function Entries({ title, items, cap = Infinity }: { title: string; items: Entry[]; cap?: number }) {
  const list = items.filter((e) => e.title || e.org);
  if (!list.length) return null;
  return (
    <Section title={title}>
      {list.map((e, i) => (
        <div className="entry" key={i}>
          <div className="entry-head">
            <span className="entry-title"><Linkify text={e.title} /></span>
            <span className="entry-dates">{e.dates}</span>
          </div>
          {(e.org || e.location) && <div className="entry-org"><Linkify text={[e.org, e.location].filter(Boolean).join(" · ")} /></div>}
          {bullets(e).slice(0, cap).length > 0 && <ul>{bullets(e).slice(0, cap).map((d, j) => <li key={j}><Linkify text={d} /></li>)}</ul>}
        </div>
      ))}
    </Section>
  );
}

/**
 * Standard entry (the user's Word layout): bold heading lines on the left, location and dates
 * stacked on the right, bullets wrapping around them.
 * Education: "Org" then "Degree". Experience: "Role, Company". Everything else: "Name | Detail".
 */
function StdEntries({ title, items, kind, cap = Infinity }: { title: string; items: Entry[]; kind: "edu" | "exp" | "other"; cap?: number }) {
  const list = items.filter((e) => e.title || e.org);
  if (!list.length) return null;
  return (
    <Section title={title}>
      {list.map((e, i) => {
        const lines = kind === "edu" ? [e.org, e.title] : [[e.title, e.org].filter(Boolean).join(kind === "exp" ? ", " : " | ")];
        return (
          <div className="entry" key={i}>
            {(e.location || e.dates) && <div className="rmeta">{e.location && <div>{e.location}</div>}{e.dates && <div>{e.dates}</div>}</div>}
            {lines.filter(Boolean).map((l, j) => <div className="line" key={j}><Linkify text={l} /></div>)}
            {bullets(e).slice(0, cap).length > 0 && <ul>{bullets(e).slice(0, cap).map((d, j) => <li key={j}><Linkify text={d} /></li>)}</ul>}
          </div>
        );
      })}
    </Section>
  );
}

/** "Label: value" -> bold label. */
function Labelled({ text }: { text: string }) {
  const m = text.match(/^([^:]{1,40}):\s*(.*)$/);
  return <div className="line-plain">{m ? <><b>{m[1]}:</b> <Linkify text={m[2]} /></> : <Linkify text={text} />}</div>;
}

function StandardPage({ p, onFit, multi = false, maxPages }: { p: Profile; onFit?: (info: FitInfo) => void; multi?: boolean; maxPages?: number }) {
  const key = JSON.stringify(p);
  const { level, d, report } = useDensity(key, onFit);
  const contact = [p.phone, p.email, ...headerLinks(p)].map((s) => (s || "").trim()).filter(Boolean);
  const extra = p.sections || [];
  const additional = (p.additional || []).filter(Boolean);
  const awards = p.awards.filter(Boolean);
  return (
    <A4 className={`page tpl-standard${d.tight ? " tight" : ""}${multi ? " multi" : ""}`} fitKey={`${level}|${key}|${multi}|${maxPages}`} onFit={report(p)} multi={multi} maxPages={maxPages}>
      <header>
        <h1>{p.name || "Your Name"}</h1>
        <div className="contact">
          {contact.map((c, i) => (
            <span key={i}>{i > 0 && " • "}<Linkify text={c} phone={c === p.phone} /></span>
          ))}
        </div>
      </header>
      {p.summary && <Section title="Profile"><p><Linkify text={p.summary} /></p></Section>}
      <StdEntries title="Education" items={p.education} kind="edu" cap={d.bullets} />
      <StdEntries title="Work Experience" items={p.experience} kind="exp" cap={d.bullets} />
      <StdEntries title="Projects" items={p.projects} kind="other" cap={d.bullets} />
      {extra.map((s, i) => <StdEntries key={i} title={s.title} items={s.entries} kind="other" cap={d.bullets} />)}
      {(awards.length > 0 || p.skills.length > 0 || additional.length > 0) && (
        <Section title="Certifications & Additional Skills">
          {awards.map((a, i) => <Labelled key={`a${i}`} text={a} />)}
          {p.skills.length > 0 && <Labelled text={`Technical Skills: ${p.skills.join(" | ")}`} />}
          {additional.map((a, i) => <Labelled key={`x${i}`} text={a} />)}
        </Section>
      )}
    </A4>
  );
}

/** A4 page. Standard has its own layout; the other templates share one DOM and differ only in CSS. */
export function ResumePage({ p, template, onFit }: { p: Profile; template: Template; onFit?: (info: FitInfo) => void }) {
  // Base resume (no tailoring): everything, over as many pages as needed. Tailored: the AI's picks on at most 2 A4 pages.
  const maxPages = p.show ? TAILORED_PAGES : undefined;
  // A tailored resume that only just spills onto page 2 gets more of your stored projects, one at a time, until
  // page 2 is at least half full, as long as it still fits 2 pages at full size; otherwise the last one is taken back.
  const key = JSON.stringify(p) + template;
  const [fill, setFill] = useState<{ key: string; extra: number; done: boolean }>({ key, extra: 0, done: !p.show });
  const cur = fill.key === key ? fill : { key, extra: 0, done: !p.show };
  if (fill.key !== key) setFill(cur);
  const spare = spareProjects(p);
  const fitted = (info: FitInfo) => {
    if (!cur.done) {
      const full = info.fits && info.scale > 0.999 && !info.hiddenBullets && (info.pages || 1) <= TAILORED_PAGES;
      if (cur.extra > 0 && !full) { setFill({ key, extra: cur.extra - 1, done: true }); return; } // last one didn't fit
      if (full && info.pages === TAILORED_PAGES && (info.lastFill ?? 1) < 0.5 && cur.extra < spare) { setFill({ key, extra: cur.extra + 1, done: false }); return; }
      setFill({ key, extra: cur.extra, done: true });
    }
    onFit?.({ ...info, extraProjects: cur.extra });
  };
  const shown = visible(p, cur.extra);
  if (template === "standard") return <StandardPage p={shown} onFit={fitted} multi maxPages={maxPages} />;
  return <OtherPage p={shown} template={template} onFit={fitted} multi maxPages={maxPages} />;
}

function OtherPage({ p, template, onFit, multi = false, maxPages }: { p: Profile; template: Template; onFit?: (info: FitInfo) => void; multi?: boolean; maxPages?: number }) {
  const key = template + JSON.stringify(p);
  const { level, d, report } = useDensity(key, onFit);
  const contact = [p.email, p.phone, p.location, ...headerLinks(p)].filter(Boolean);
  const extra = p.sections || [];
  const additional = (p.additional || []).filter(Boolean);
  return (
    <A4 className={`page tpl-${template}${d.tight ? " tight" : ""}${multi ? " multi" : ""}`} fitKey={`${level}|${key}|${multi}|${maxPages}`} onFit={report(p)} multi={multi} maxPages={maxPages}>
      <header>
        <h1>{p.name || "Your Name"}</h1>
        <div className="contact">{contact.map((c, i) => <span key={i}><Linkify text={c} phone={c === p.phone} /></span>)}</div>
      </header>
      {p.summary && <Section title="Summary"><p><Linkify text={p.summary} /></p></Section>}
      {p.skills.length > 0 && (
        <Section title="Skills">
          <div className="skills">{p.skills.map((s, i) => <span key={i}>{s}</span>)}</div>
        </Section>
      )}
      <Entries title="Experience" items={p.experience} cap={d.bullets} />
      <Entries title="Projects" items={p.projects} cap={d.bullets} />
      <Entries title="Education" items={p.education} cap={d.bullets} />
      {extra.filter((s) => hasEntries(s.entries)).map((s, i) => <Entries key={i} title={s.title} items={s.entries} cap={d.bullets} />)}
      {(p.awards.filter(Boolean).length > 0 || additional.length > 0) && (
        <Section title="Awards & Certifications">
          {p.awards.filter(Boolean).length > 0 && <ul>{p.awards.filter(Boolean).map((a, i) => <li key={i}><Linkify text={a} /></li>)}</ul>}
          {additional.map((a, i) => <Labelled key={i} text={a} />)}
        </Section>
      )}
    </A4>
  );
}

export function LetterPage({ p, text, template, onFit }: { p: Profile; text: string; template: Template; onFit?: (info: FitInfo) => void }) {
  const key = template + text + JSON.stringify(p);
  const { level, d, report } = useDensity(key, onFit);
  const tight = level > 0;
  const contact = [p.email, p.phone, p.location, ...headerLinks(p)].filter(Boolean);
  return (
    <A4 className={`page letter tpl-${template}${tight ? " tight" : ""}`} fitKey={`${Math.min(level, 1)}|${key}`} onFit={(r) => (level === 0 && !r.fits ? report(null)(r) : onFit?.({ ...r, tight: d.tight, hiddenBullets: 0 }))}>
      <header>
        <h1>{p.name || "Your Name"}</h1>
        <div className="contact">{contact.map((c, i) => <span key={i}><Linkify text={c} phone={c === p.phone} /></span>)}</div>
      </header>
      <div className="date">{new Date().toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" })}</div>
      {text.split(/\n\s*\n/).map((para, i) => <p key={i}><Linkify text={para.trim()} /></p>)}
    </A4>
  );
}
