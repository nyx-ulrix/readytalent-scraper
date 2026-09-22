import type { Entry, Profile, Template } from "./types";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Entries({ title, items }: { title: string; items: Entry[] }) {
  const list = items.filter((e) => e.title || e.org);
  if (!list.length) return null;
  return (
    <Section title={title}>
      {list.map((e, i) => (
        <div className="entry" key={i}>
          <div className="entry-head">
            <span className="entry-title">{e.title}</span>
            <span className="entry-dates">{e.dates}</span>
          </div>
          {e.org && <div className="entry-org">{e.org}</div>}
          {e.details.filter(Boolean).length > 0 && (
            <ul>{e.details.filter(Boolean).map((d, j) => <li key={j}>{d}</li>)}</ul>
          )}
        </div>
      ))}
    </Section>
  );
}

/** A4 page. Same DOM for every template; the template only changes CSS. */
export function ResumePage({ p, template }: { p: Profile; template: Template }) {
  const contact = [p.email, p.phone, p.location, p.links].filter(Boolean);
  return (
    <div className={`page tpl-${template}`}>
      <header>
        <h1>{p.name || "Your Name"}</h1>
        <div className="contact">{contact.map((c, i) => <span key={i}>{c}</span>)}</div>
      </header>
      {p.summary && <Section title="Summary"><p>{p.summary}</p></Section>}
      {p.skills.length > 0 && (
        <Section title="Skills">
          <div className="skills">{p.skills.map((s, i) => <span key={i}>{s}</span>)}</div>
        </Section>
      )}
      <Entries title="Experience" items={p.experience} />
      <Entries title="Projects" items={p.projects} />
      <Entries title="Education" items={p.education} />
      {p.awards.filter(Boolean).length > 0 && (
        <Section title="Awards & Certifications">
          <ul>{p.awards.filter(Boolean).map((a, i) => <li key={i}>{a}</li>)}</ul>
        </Section>
      )}
    </div>
  );
}

export function LetterPage({ p, text, template }: { p: Profile; text: string; template: Template }) {
  const contact = [p.email, p.phone, p.location].filter(Boolean);
  return (
    <div className={`page letter tpl-${template}`}>
      <header>
        <h1>{p.name || "Your Name"}</h1>
        <div className="contact">{contact.map((c, i) => <span key={i}>{c}</span>)}</div>
      </header>
      <div className="date">{new Date().toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" })}</div>
      {text.split(/\n\s*\n/).map((para, i) => <p key={i}>{para.trim()}</p>)}
    </div>
  );
}
