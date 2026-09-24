import type { Entry, Profile, Template } from "./types";
import { Linkify } from "./linkify";
import { headerLinks } from "./links";

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

function StandardPage({ p }: { p: Profile }) {
  const contact = [p.phone, p.email, ...headerLinks(p)].map((s) => (s || "").trim()).filter(Boolean);
  const extra = p.sections || [];
  const additional = (p.additional || []).filter(Boolean);
  const awards = p.awards.filter(Boolean);
  return (
    <div className="page tpl-standard">
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
      <StdEntries title="Projects" items={p.projects} kind="other" />
      {extra.map((s, i) => <StdEntries key={i} title={s.title} items={s.entries} kind="other" />)}
      {(awards.length > 0 || p.skills.length > 0 || additional.length > 0) && (
        <Section title="Certifications & Additional Skills">
          {awards.map((a, i) => <Labelled key={`a${i}`} text={a} />)}
          {p.skills.length > 0 && <Labelled text={`Technical Skills: ${p.skills.join(" | ")}`} />}
          {additional.map((a, i) => <Labelled key={`x${i}`} text={a} />)}
        </Section>
      )}
    </div>
  );
}

/** A4 page. Standard has its own layout; the other templates share one DOM and differ only in CSS. */
export function ResumePage({ p, template }: { p: Profile; template: Template }) {
  if (template === "standard") return <StandardPage p={p} />;
  const contact = [p.email, p.phone, p.location, ...headerLinks(p)].filter(Boolean);
  const extra = p.sections || [];
  const additional = (p.additional || []).filter(Boolean);
  return (
    <div className={`page tpl-${template}`}>
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
      <Entries title="Projects" items={p.projects} />
      <Entries title="Education" items={p.education} />
      {extra.filter((s) => hasEntries(s.entries)).map((s, i) => <Entries key={i} title={s.title} items={s.entries} />)}
      {(p.awards.filter(Boolean).length > 0 || additional.length > 0) && (
        <Section title="Awards & Certifications">
          {p.awards.filter(Boolean).length > 0 && <ul>{p.awards.filter(Boolean).map((a, i) => <li key={i}><Linkify text={a} /></li>)}</ul>}
          {additional.map((a, i) => <Labelled key={i} text={a} />)}
        </Section>
      )}
    </div>
  );
}

export function LetterPage({ p, text, template }: { p: Profile; text: string; template: Template }) {
  const contact = [p.email, p.phone, p.location, ...headerLinks(p)].filter(Boolean);
  return (
    <div className={`page letter tpl-${template}`}>
      <header>
        <h1>{p.name || "Your Name"}</h1>
        <div className="contact">{contact.map((c, i) => <span key={i}><Linkify text={c} phone={c === p.phone} /></span>)}</div>
      </header>
      <div className="date">{new Date().toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" })}</div>
      {text.split(/\n\s*\n/).map((para, i) => <p key={i}><Linkify text={para.trim()} /></p>)}
    </div>
  );
}
