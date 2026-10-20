import { useState } from "react";
import { fetchPageText } from "../store";
import { mergeProfile, mergeSummary } from "../merge";
import { parseResume } from "../ai";
import { MARKER } from "../markdown";
import { MAX_PROJECTS, MAX_SKILLS, isLeadership, sectionKey, sectionLimit, shownCount } from "../limits";
import { emptyEntry, type Entry, type Profile, type State } from "../types";
import { aiCfg, type Update, aiConfirm, LINK } from "../appShared";
import { confirmDelete, Progress, Trash, arrayMove, useDragSort, DragHandle } from "../ui/common";

/**
 * Add new details from a newer resume, a page (e.g. your portfolio) or pasted text. Nothing you already have is
 * deleted or reworded; new jobs, projects, bullets and skills are added below yours. Undo restores the previous details.
 */
export function UpdateDetails({ state, update }: { state: State; update: Update }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [before, setBefore] = useState<Profile | null>(null);
  const isLink = LINK.test(text.trim());
  const run = async (file: File, label: string) => {
    setErr(""); setMsg("");
    try {
      const exact = /\.(md|markdown|txt)$/i.test(file.name) && (await file.text()).trimStart().startsWith(MARKER);
      if (!exact && !aiConfirm(state, `Read ${label} with the AI and add anything new to your details? Nothing you have is removed.`)) return;
      setBusy(`Reading ${label}…`);
      const found = await parseResume(aiCfg(state), file);
      const prev = state.profile;
      const { added } = mergeProfile(prev, found);
      update((s) => ({ ...s, profile: mergeProfile(s.profile, found).profile }));
      setBefore(prev);
      setMsg(`Added from ${label}: ${mergeSummary(added)}. New items are below yours in each list; review them below.`);
      if (added.entries + added.bullets + added.skills + added.other === 0) setBefore(null);
      setText("");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(""); }
  };
  const fromBox = async () => {
    if (!isLink) return run(new File([text], "pasted.md", { type: "text/markdown" }), "the pasted text");
    setErr(""); setBusy("Reading the page…");
    try { const page = await fetchPageText(text.trim()); setBusy(""); await run(new File([page], "page.md", { type: "text/markdown" }), text.trim()); }
    catch (e) { setErr((e as Error).message); setBusy(""); }
  };
  return (
    <div className="card" style={{ marginTop: 8 }}>
      <b>Update your details</b>
      <div className="small muted">Add what's new from a newer resume, your portfolio or LinkedIn page, or any text about you. Nothing you already have is removed or reworded: new jobs, projects, bullet points and skills are added below yours.</div>
      <textarea rows={3} value={text} disabled={!!busy} onChange={(e) => setText(e.target.value)} placeholder="Paste text about your experience, or a link (e.g. https://yourname.com)" />
      <div className="actions">
        <button disabled={!!busy || !text.trim()} title="Uses AI tokens" onClick={() => void fromBox()}>✦ Add to my details{isLink ? " from link" : ""}</button>
        <label style={{ margin: 0 }}><span className="chip" style={{ cursor: "pointer" }}>Add from a resume file (PDF / image / MD)</span>
          <input type="file" accept="application/pdf,image/*,.md,.markdown,.txt,text/markdown,text/plain" style={{ display: "none" }} disabled={!!busy}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void run(f, `"${f.name}"`); }} />
        </label>
        {before && <button className="ghost" onClick={() => { update({ profile: before }); setBefore(null); setMsg("Undone: your details are as they were."); }}>Undo</button>}
      </div>
      {busy && <Progress label={busy.replace(/…$/, "")} expectMs={busy.startsWith("Reading the page") ? 6000 : 20000} />}
      {msg && <div className="status" style={{ color: "var(--ok)" }}>{msg}</div>}
      {err && <div className="status err">{err}</div>}
    </div>
  );
}

/** Resume content editor (summary, skills, entries, sections, awards, skill lines). Used for your details and for editing any tailored version. */
export function ProfileBody({ p, setP }: { p: Profile; setP: (patch: Partial<Profile>) => void }) {
  const secs = p.sections || [];
  const secDrag = useDragSort(secs.length, (from, to) => setP({ sections: arrayMove(secs, from, to) }));
  return (
    <>
      <label>Summary</label>
      <textarea value={p.summary} onChange={(e) => setP({ summary: e.target.value })} placeholder="2-3 lines about you. The AI can rewrite this per job." />
      <label>Skills (comma separated, most relevant first)</label>
      <div className="small muted">{p.show ? `This tailored resume shows the first ${Math.min(shownCount(p, "skills", MAX_SKILLS), p.skills.filter(Boolean).length)} of ${p.skills.filter(Boolean).length}; the rest stay stored here.` : `Your base resume shows all ${p.skills.filter(Boolean).length}; tailored resumes show the ${MAX_SKILLS} most relevant.`}</div>
      <textarea value={p.skills.join(", ")} onChange={(e) => setP({ skills: e.target.value.split(",").map((s) => s.trim()) })} onBlur={(e) => setP({ skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />

      <EntryList title="Experience" items={p.experience} onChange={(experience) => setP({ experience })} />
      <EntryList title="Projects" items={p.projects} shown={p.show ? shownCount(p, "projects", MAX_PROJECTS) : Infinity} onChange={(projects) => setP({ projects })} />
      <EntryList title="Education" items={p.education} onChange={(education) => setP({ education })} />
      {(p.sections || []).map((sec, si) => (
        <div key={si} ref={secDrag.ref(si)} className={secDrag.dragging === si ? "dragging" : ""}>
          <div className="row" style={{ marginTop: 26 }}>
            {secs.length > 1 && <DragHandle label={`Move section ${sec.title || "Untitled"}`} {...secDrag.handle(si)} />}
            <input value={sec.title} placeholder="Section title, e.g. Competition" style={{ flex: 1, fontWeight: 600 }} onChange={(e) => setP({ sections: p.sections.map((x, j) => (j === si ? { ...x, title: e.target.value } : x)) })} />
            <button className="ghost" onClick={async () => { if (await confirmDelete(`Remove the section "${sec.title || "Untitled"}" and its ${sec.entries.length} entries?`)) setP({ sections: p.sections.filter((_, j) => j !== si) }); }}>Remove section</button>
          </div>
          <EntryList title={sec.title || "Entries"} items={sec.entries} shown={p.show ? shownCount(p, sectionKey(sec.title), sectionLimit(sec.title)) : Infinity} onChange={(entries) => setP({ sections: p.sections.map((x, j) => (j === si ? { ...x, entries } : x)) })} />
        </div>
      ))}
      <div className="actions"><button className="ghost" onClick={() => setP({ sections: [...(p.sections || []), { title: "", entries: [emptyEntry()] }] })}>+ Add section (e.g. Competition, Leadership)</button></div>
      <label>Awards & certifications (one per line)</label>
      <textarea value={p.awards.join("\n")} onChange={(e) => setP({ awards: e.target.value.split("\n") })} onBlur={(e) => setP({ awards: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
      <label>Other skill lines, one per line (e.g. "Soft Skills: Analytical Thinking | Communication", "Interests: Data Analytics")</label>
      <textarea value={(p.additional || []).join("\n")} onChange={(e) => setP({ additional: e.target.value.split("\n") })} onBlur={(e) => setP({ additional: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })} />
    </>
  );
}

/**
 * One section of your details (Experience, Projects...). Each entry is a one-line title you tap to open and edit;
 * ↑ ↓ set your ranking without opening it. New entries open straight away.
 */
export function EntryList({ title, items, shown = Infinity, onChange }: { title: string; items: Entry[]; shown?: number; onChange: (e: Entry[]) => void }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const set = (i: number, patch: Partial<Entry>) => onChange(items.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const toggle = (i: number, on: boolean) => setOpen((o) => { const n = new Set(o); if (on) n.add(i); else n.delete(i); return n; });
  /** Move an entry (and keep the same entries open). */
  const move = (from: number, to: number) => {
    onChange(arrayMove(items, from, to));
    setOpen((o) => new Set(arrayMove(items.map((_, k) => o.has(k)), from, to).flatMap((on, k) => (on ? [k] : []))));
  };
  const drag = useDragSort(items.length, move);
  const remove = async (i: number) => {
    if (!(await confirmDelete(`Delete "${items[i].title || "this entry"}" from ${title}? Its bullet points are deleted too.`))) return;
    onChange(items.filter((_, j) => j !== i));
    setOpen((o) => new Set([...o].filter((k) => k !== i).map((k) => (k > i ? k - 1 : k))));
  };
  return (
    <>
      <h2>{title} <button className="ghost small" style={{ marginLeft: 8 }} onClick={() => { onChange([...items, emptyEntry()]); toggle(items.length, true); }}>+ Add</button></h2>
      <div className="small muted">Tap an entry to see and edit its details. Your ranking: drag ⠿ to put what you most want to showcase first. Tailored resumes pick your higher-ranked ones whenever they're relevant enough to the job{title !== "Experience" && title !== "Education" ? `; tick "Only if very relevant" on ones you don't want shown otherwise` : ""}.{shown < items.length ? ` This tailored resume shows the top ${shown}; everything below stays stored.` : title === "Projects" || isLeadership(title) ? ` Your base resume shows them all; tailored resumes pick at most ${title === "Projects" ? MAX_PROJECTS : 2}.` : ""}</div>
      {items.map((e, i) => (
        <details key={i} ref={drag.ref(i)} open={open.has(i)} onToggle={(ev) => { const on = (ev.target as HTMLDetailsElement).open; if (on !== open.has(i)) toggle(i, on); }}
          className={`card entry${i >= shown || e.onlyIfVeryRelevant ? " stored" : ""}${drag.dragging === i ? " dragging" : ""}`} title={e.onlyIfVeryRelevant ? "Only used when very relevant to a job" : i >= shown ? "Stored, not on the page" : undefined}>
          <summary>
            {items.length > 1 && <DragHandle label={`Move ${e.title || "entry"} (now #${i + 1})`} {...drag.handle(i)} />}
            <span className="rank">#{i + 1}</span>
            <span className="entry-title">
              <b>{e.title || <span className="muted">Untitled</span>}</b>
              {(e.org || e.dates) && <span className="small muted"> · {[e.org, e.dates].filter(Boolean).join(" · ")}</span>}
              {e.onlyIfVeryRelevant && <span className="small muted"> · only if very relevant</span>}
            </span>
          </summary>
          <div className="row" style={{ marginTop: 8 }}>
            <input placeholder={title === "Education" ? "Degree" : "Role / project name"} value={e.title} onChange={(ev) => set(i, { title: ev.target.value })} />
            <input placeholder={title === "Projects" ? "Tech stack" : "Organisation"} value={e.org} onChange={(ev) => set(i, { org: ev.target.value })} />
            <input placeholder="Location" value={e.location || ""} onChange={(ev) => set(i, { location: ev.target.value })} />
            <input placeholder="Dates (e.g. Jan 2024 – Present)" value={e.dates} onChange={(ev) => set(i, { dates: ev.target.value })} />
          </div>
          {title !== "Experience" && title !== "Education" && <label className="only-if" title="For things you don't find impressive: tailored resumes use it only when it closely matches the job, and your base resume leaves it out.">
            <input type="checkbox" checked={!!e.onlyIfVeryRelevant} onChange={(ev) => set(i, { onlyIfVeryRelevant: ev.target.checked || undefined })} /> Only if very relevant (not one I'd showcase)
          </label>}
          <textarea placeholder="Bullet points, one per line" value={e.details.join("\n")} rows={Math.min(Math.max(e.details.length + 1, 3), 12)} onChange={(ev) => set(i, { details: ev.target.value.split("\n") })} onBlur={(ev) => set(i, { details: ev.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="ghost small" onClick={() => toggle(i, false)}>Done</button>
            <button className="ghost small icon danger-text" title="Delete this entry" aria-label="Delete this entry" onClick={() => void remove(i)}><Trash /></button>
          </div>
        </details>
      ))}
    </>
  );
}
