import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Entry, Profile, Template } from "./types";
import { Linkify } from "./linkify";
import { headerLinks } from "./links";
import { MAX_PROJECTS, sectionLimit } from "./limits";

/** Smallest text allowed on a resume or letter. */
export const MIN_FONT_PT = 8;
const PT_TO_PX = 96 / 72;

/** What the fitting did, for the note on the Resume tab. */
export type FitInfo = { scale: number; smallestPt: number; hiddenBullets: number; tight: boolean; fits: boolean };

/**
 * Exactly one A4 sheet. If the content is taller than the page, everything inside is scaled down evenly
 * (text, spacing, headings), but never so far that the smallest text drops below MIN_FONT_PT.
 * The width is compensated so lines still span the full page. Reports whether it fits at that limit.
 */
function A4({ className, fitKey, onFit, children }: { className: string; fitKey: string; onFit?: (r: { scale: number; smallestPt: number; fits: boolean }) => void; children: ReactNode }) {
  const area = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const fit = () => {
      const a = area.current, b = body.current;
      if (!a || !b) return;
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
  [...p.education, ...p.experience, ...p.projects.slice(0, MAX_PROJECTS), ...(p.sections || []).flatMap((s) => s.entries.slice(0, sectionLimit(s.title)))]
    .reduce((n, e) => n + Math.max(0, bullets(e).length - cap), 0);

/** Picks the first density step that fits; resets when the content or template changes. */
function useDensity(key: string, onFit?: (info: FitInfo) => void) {
  const [level, setLevel] = useState(0);
  useEffect(() => setLevel(0), [key]);
  const report = (p: Profile | null) => (r: { scale: number; smallestPt: number; fits: boolean }) => {
    if (!r.fits && level < DENSITY.length - 1) { setLevel(level + 1); return; }
    const d = DENSITY[level];
    onFit?.({ scale: r.scale, smallestPt: r.smallestPt, fits: r.fits, tight: d.tight, hiddenBullets: p ? hiddenCount(p, d.bullets) : 0 });
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

function StandardPage({ p, onFit }: { p: Profile; onFit?: (info: FitInfo) => void }) {
  const key = JSON.stringify(p);
  const { level, d, report } = useDensity(key, onFit);
  const contact = [p.phone, p.email, ...headerLinks(p)].map((s) => (s || "").trim()).filter(Boolean);
  const extra = p.sections || [];
  const additional = (p.additional || []).filter(Boolean);
  const awards = p.awards.filter(Boolean);
  return (
    <A4 className={`page tpl-standard${d.tight ? " tight" : ""}`} fitKey={`${level}|${key}`} onFit={report(p)}>
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
      <StdEntries title="Projects" items={p.projects.slice(0, MAX_PROJECTS)} kind="other" cap={d.bullets} />
      {extra.map((s, i) => <StdEntries key={i} title={s.title} items={s.entries.slice(0, sectionLimit(s.title))} kind="other" cap={d.bullets} />)}
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
  if (template === "standard") return <StandardPage p={p} onFit={onFit} />;
  return <OtherPage p={p} template={template} onFit={onFit} />;
}

function OtherPage({ p, template, onFit }: { p: Profile; template: Template; onFit?: (info: FitInfo) => void }) {
  const key = template + JSON.stringify(p);
  const { level, d, report } = useDensity(key, onFit);
  const contact = [p.email, p.phone, p.location, ...headerLinks(p)].filter(Boolean);
  const extra = p.sections || [];
  const additional = (p.additional || []).filter(Boolean);
  return (
    <A4 className={`page tpl-${template}${d.tight ? " tight" : ""}`} fitKey={`${level}|${key}`} onFit={report(p)}>
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
      <Entries title="Projects" items={p.projects.slice(0, MAX_PROJECTS)} cap={d.bullets} />
      <Entries title="Education" items={p.education} cap={d.bullets} />
      {extra.filter((s) => hasEntries(s.entries)).map((s, i) => <Entries key={i} title={s.title} items={s.entries.slice(0, sectionLimit(s.title))} cap={d.bullets} />)}
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
