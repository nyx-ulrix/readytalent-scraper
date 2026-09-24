import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { Entry, Profile, Template } from "./types";
import { Linkify } from "./linkify";
import { headerLinks } from "./links";
import { MAX_PROJECTS, sectionLimit } from "./limits";

/**
 * Exactly one A4 sheet. If the content is taller than the page, everything inside is scaled down evenly
 * (text, spacing, headings) until it fits; the width is compensated so lines still span the full page.
 * Reports the scale so the UI can warn when text gets small.
 */
function A4({ className, fitKey, onFit, children }: { className: string; fitKey: string; onFit?: (scale: number) => void; children: ReactNode }) {
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
      let f = 1;
      if (at(1) > room) {
        let lo = 0.2, hi = 1;
        for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (at(mid) <= room) lo = mid; else hi = mid; }
        f = lo;
        at(f);
      }
      onFit?.(f);
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
const hasEntries = (items: Entry[]) => items.some((e) => e.title || e.org);

/** Classic / modern / compact entry: title + dates, then org · location, then bullets. */
function Entries({ title, items }: { title: string; items: Entry[] }) {
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
          {bullets(e).length > 0 && <ul>{bullets(e).map((d, j) => <li key={j}><Linkify text={d} /></li>)}</ul>}
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
function StdEntries({ title, items, kind }: { title: string; items: Entry[]; kind: "edu" | "exp" | "other" }) {
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
            {bullets(e).length > 0 && <ul>{bullets(e).map((d, j) => <li key={j}><Linkify text={d} /></li>)}</ul>}
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

function StandardPage({ p, onFit }: { p: Profile; onFit?: (scale: number) => void }) {
  const contact = [p.phone, p.email, ...headerLinks(p)].map((s) => (s || "").trim()).filter(Boolean);
  const extra = p.sections || [];
  const additional = (p.additional || []).filter(Boolean);
  const awards = p.awards.filter(Boolean);
  return (
    <A4 className="page tpl-standard" fitKey={JSON.stringify(p)} onFit={onFit}>
      <header>
        <h1>{p.name || "Your Name"}</h1>
        <div className="contact">
          {contact.map((c, i) => (
            <span key={i}>{i > 0 && " • "}<Linkify text={c} phone={c === p.phone} /></span>
          ))}
        </div>
      </header>
      {p.summary && <Section title="Profile"><p><Linkify text={p.summary} /></p></Section>}
      <StdEntries title="Education" items={p.education} kind="edu" />
      <StdEntries title="Work Experience" items={p.experience} kind="exp" />
      <StdEntries title="Projects" items={p.projects.slice(0, MAX_PROJECTS)} kind="other" />
      {extra.map((s, i) => <StdEntries key={i} title={s.title} items={s.entries.slice(0, sectionLimit(s.title))} kind="other" />)}
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
export function ResumePage({ p, template, onFit }: { p: Profile; template: Template; onFit?: (scale: number) => void }) {
  if (template === "standard") return <StandardPage p={p} onFit={onFit} />;
  const contact = [p.email, p.phone, p.location, ...headerLinks(p)].filter(Boolean);
  const extra = p.sections || [];
  const additional = (p.additional || []).filter(Boolean);
  return (
    <A4 className={`page tpl-${template}`} fitKey={template + JSON.stringify(p)} onFit={onFit}>
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
      <Entries title="Experience" items={p.experience} />
      <Entries title="Projects" items={p.projects.slice(0, MAX_PROJECTS)} />
      <Entries title="Education" items={p.education} />
      {extra.filter((s) => hasEntries(s.entries)).map((s, i) => <Entries key={i} title={s.title} items={s.entries.slice(0, sectionLimit(s.title))} />)}
      {(p.awards.filter(Boolean).length > 0 || additional.length > 0) && (
        <Section title="Awards & Certifications">
          {p.awards.filter(Boolean).length > 0 && <ul>{p.awards.filter(Boolean).map((a, i) => <li key={i}><Linkify text={a} /></li>)}</ul>}
          {additional.map((a, i) => <Labelled key={i} text={a} />)}
        </Section>
      )}
    </A4>
  );
}

export function LetterPage({ p, text, template, onFit }: { p: Profile; text: string; template: Template; onFit?: (scale: number) => void }) {
  const contact = [p.email, p.phone, p.location, ...headerLinks(p)].filter(Boolean);
  return (
    <A4 className={`page letter tpl-${template}`} fitKey={template + text + JSON.stringify(p)} onFit={onFit}>
      <header>
        <h1>{p.name || "Your Name"}</h1>
        <div className="contact">{contact.map((c, i) => <span key={i}><Linkify text={c} phone={c === p.phone} /></span>)}</div>
      </header>
      <div className="date">{new Date().toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" })}</div>
      {text.split(/\n\s*\n/).map((para, i) => <p key={i}><Linkify text={para.trim()} /></p>)}
    </A4>
  );
}
