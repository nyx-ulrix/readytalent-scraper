import { useEffect, useState } from "react";
import { fetchMeta } from "../store";
import { PROVIDERS, isAccount, listModels, rankProfile, parseResume, pingModel, priceFor, priceTable, type ModelInfo, type Price, type Provider } from "../ai";
import { MARKER, toMarkdown } from "../markdown";
import { DEFAULT_META, isDesktop, type Meta, type Profile, type State } from "../types";
import { KEY_OF, keyOf, aiCfg, type Update, aiConfirm } from "../appShared";
import { confirmDelete } from "../ui/common";
import { UpdateDetails, ProfileBody } from "./Details";

/* ---------------- Settings ---------------- */

/** Settings (AI, preferences, sign-in, devices, data) and, with part="details", the Details tab (your resume content). */
export function Settings({ part, state, update }: { part: "settings" | "details"; state: State; update: Update }) {
  const p = state.profile;
  const setP = (patch: Partial<Profile>) => update({ profile: { ...p, ...patch } });
  const [lan, setLan] = useState<string[]>([]);
  const [meta, setMeta] = useState<Meta>(DEFAULT_META);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const [ranking, setRanking] = useState("");
  const rank = async () => {
    setRanking("Ranking…");
    try {
      const apply = await rankProfile(aiCfg(state), p, state.interests || [], state.about || "");
      update((s) => ({ ...s, profile: apply(s.profile) }));
      setRanking("Ranked. The page shows the top of each list; nothing was removed.");
    } catch (e) { setRanking(`Ranking failed: ${(e as Error).message}`); }
  };
  useEffect(() => {
    fetchMeta().then(setMeta);
    if (isDesktop()) fetch("/api/info").then((r) => r.json()).then((i) => setLan(i.lan || [])).catch(() => undefined);
  }, []);
  const field = (key: keyof Profile, label: string, ph = "") => (
    <div><label>{label}</label><input value={p[key] as string} placeholder={ph} onChange={(e) => setP({ [key]: e.target.value })} /></div>
  );
  return (
    <div className="settings app-chrome">
      {part === "settings" && (<>
      <h2>AI</h2>
      <label>Provider used for keywords, resumes, cover letters and resume import</label>
      <select value={state.provider} onChange={(e) => update({ provider: e.target.value as Provider })}>
        {(Object.keys(PROVIDERS) as Provider[]).map((p) => <option key={p} value={p}>{PROVIDERS[p].label}{isAccount(p) || keyOf(state, p) ? "" : " (no key)"}</option>)}
      </select>
      {isAccount(state.provider) && <AccountSetup tool={state.provider as "gemini-cli" | "claude-code"} model={state.models?.[state.provider] || ""} />}
      <ModelPicker state={state} update={update} />
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={state.warnTokens !== false} onChange={(e) => update({ warnTokens: e.target.checked })} /> Ask before every AI action (✦). AI actions consume API tokens; nothing runs without your click.</label>
      <div className="small muted">API keys are stored only on this device / your laptop. Signed-in Gemini and Claude need no key.</div>
      {(Object.keys(PROVIDERS) as Provider[]).filter((p) => KEY_OF[p]).map((p) => (
        <div key={p}>
          <label>{PROVIDERS[p].label} API key · <a href={PROVIDERS[p].keyUrl} target="_blank" rel="noreferrer">get key</a></label>
          <input type="password" value={keyOf(state, p)} placeholder={PROVIDERS[p].placeholder} onChange={(e) => update({ [KEY_OF[p]!]: e.target.value })} autoComplete="off" />
        </div>
      ))}

      {isDesktop() && <Credentials />}

      <h2>Job preferences</h2>
      <div className="small muted">Set these before scraping. They filter the job list and are saved between sessions.</div>
      <div className="grid2">
        <div><label>Employment type</label>
          <select value={state.employmentType} onChange={(e) => update({ employmentType: e.target.value })}>
            <option value="">All employment types</option>
            {meta.employmentTypes.map((t) => <option key={t}>{t}</option>)}
          </select></div>
        <div><label>Course / programme</label>
          <select value={state.course} onChange={(e) => update({ course: e.target.value })}>
            <option value="">All programmes</option>
            {meta.programmes.map((c) => <option key={c}>{c}</option>)}
          </select></div>
      </div>

      </>)}
      {part === "details" && (<>
      <h2>Your details</h2>
      <UpdateDetails state={state} update={update} />
      <div className="small muted" style={{ marginTop: 12 }}>Or start over from a resume (PDF, photo or Markdown .md; the AI reads and OCRs it): this replaces the details below.</div>
      <div className="actions">
        <label style={{ margin: 0 }}><span className="chip" style={{ cursor: "pointer" }}>{importing ? "Reading resume…" : "Replace with a resume (PDF / image / MD)"}</span>
          <input type="file" accept="application/pdf,image/*,.md,.markdown,.txt,text/markdown,text/plain" style={{ display: "none" }} disabled={importing} onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
            const exactTemplate = /\.(md|markdown|txt)$/i.test(f.name) && (await f.text()).trimStart().startsWith(MARKER);
            if (!(await confirmDelete(`Replace ALL your details with what's in "${f.name}"? Everything you have now is overwritten. (To add to your details instead, use "Update your details" above.)`))) return;
            if (!exactTemplate && !aiConfirm(state, `Read "${f.name}" with the AI and replace your details with what it finds?`)) return;
            setImporting(true); setImportStatus("");
            try { const parsed = await parseResume(aiCfg(state), f); update({ profile: parsed }); setImportStatus(`Imported ${f.name}. Review the fields below.`); }
            catch (err) { setImportStatus((err as Error).message); }
            setImporting(false);
          }} />
        </label>
        <button className="ghost" onClick={() => {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([toMarkdown(p)], { type: "text/markdown" }));
          a.download = `${p.name || "resume"}.md`; a.click();
        }}>Download .md template</button>
        <span className="status">{importStatus}</span>
      </div>
      <div className="small muted">The .md template holds your current details. Edit it in any text editor and upload it back; that format imports instantly without an AI key.</div>
      <div className="grid2">
        {field("name", "Full name")}
        {field("email", "Email")}
        {field("phone", "Phone")}
        {field("location", "Location", "Singapore")}
      </div>
      <div className="grid2">
        {field("portfolio", "Portfolio / website", "https://yourname.com")}
        {field("linkedin", "LinkedIn", "https://www.linkedin.com/in/you/")}
        {field("github", "GitHub", "https://github.com/you")}
        {field("links", "Other links (optional)", "e.g. https://yourblog.com · https://dribbble.com/you")}
      </div>
      <div className="small muted">The resume header shows phone • email • portfolio • LinkedIn • GitHub, all clickable in the PDF.</div>
      <div className="row" style={{ marginTop: 16, alignItems: "center" }}>
        <button className="ghost" title="Uses AI tokens" disabled={ranking === "Ranking…"} onClick={() => { if (aiConfirm(state, `Rank your projects, sections and skills by relevance to ${(state.interests || []).length ? "the roles you want (Find jobs tab)" : "the roles your resume fits"}? This replaces your own ranking order; nothing is removed.`)) void rank(); }}>✦ Rank by relevance</button>
        <span className="small muted">{ranking || "Everything stays stored; resumes show the top of each list."}</span>
      </div>
      <ProfileBody p={p} setP={setP} />
      <label>More about you, for the AI only (languages such as Mandarin / Chinese, soft skills, achievements). Resumes and letters may only state facts from your resume and this box.</label>
      <textarea value={state.about || ""} rows={4} placeholder={"e.g. Fluent in English and Mandarin (Chinese). Strong at teamwork, communication and problem solving."} onChange={(e) => update({ about: e.target.value })} />
      </>)}
      {part === "settings" && (<>

      {isDesktop() && (
        <>
          <h2>Phone and tablet access</h2>
          <div className="small muted">On the same Wi-Fi, open this in your phone or tablet browser, then use "Add to Home Screen". Everything syncs with this laptop while AutoResume is running here.</div>
          {lan.length ? <ul>{lan.map((u) => <li key={u}><code style={{ fontSize: 16 }}>{u}</code></li>)}</ul> : <div className="small warn">This laptop isn't on a Wi-Fi or wired network right now.</div>}
          <div className="small muted">Page won't load on the phone? Windows Firewall is probably blocking it on your home network: open <b>Windows Security → Firewall &amp; network protection → Allow an app through firewall</b>, click <b>Change settings</b>, and tick <b>Private</b> next to <b>autoresume</b>. Also check the phone is on the same Wi-Fi, not mobile data or a guest network.</div>
        </>
      )}
      <h2>Data</h2>
      <div className="small muted">Everything is saved locally: on this device (browser storage) and in the laptop app's data folder. Nothing is uploaded except the prompts sent to Gemini.</div>
      <div className="actions">
        <button className="ghost" onClick={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" })); a.download = "autoresume-backup.json"; a.click(); }}>Export backup</button>
        <label style={{ margin: 0 }}><span className="chip" style={{ cursor: "pointer" }}>Import backup</span>
          <input type="file" accept="application/json" style={{ display: "none" }} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f && await confirmDelete(`Replace everything in AutoResume with the backup "${f.name}"? Your current details, saved jobs and resumes are overwritten.`)) update(JSON.parse(await f.text())); }} />
        </label>
      </div>
      </>)}
    </div>
  );
}

/** ReadyTalent sign-in, stored encrypted on this laptop only (Windows DPAPI). Used by Scrape to sign in without opening the website. */
export function Credentials() {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [savedUser, setSavedUser] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => { window.desktop!.getCreds().then((c) => { setSavedUser(c.user); setUser(c.user); }); }, []);
  const save = async (clear = false) => {
    try {
      const r = await window.desktop!.setCreds(clear ? "" : user.trim(), clear ? "" : pass);
      setSavedUser(r.user); setPass(""); setStatus(r.user ? `Saved. Scrape will sign in as ${r.user}.` : "Cleared.");
    } catch (e) { setStatus((e as Error).message); }
  };
  return (
    <>
      <h2>ReadyTalent sign-in</h2>
      <div className="small muted">Your SIT login, e.g. <code>2301234@sit.singaporetech.edu.sg</code>. Kept encrypted on this laptop, never sent to the tablet. Scrape signs in for you each session.</div>
      <div className="grid2">
        <div><label>Username</label><input value={user} placeholder="studentid@sit.singaporetech.edu.sg" autoComplete="off" onChange={(e) => setUser(e.target.value)} /></div>
        <div><label>Password</label><input type="password" value={pass} placeholder={savedUser ? "•••••••• (saved)" : ""} autoComplete="new-password" onChange={(e) => setPass(e.target.value)} /></div>
      </div>
      <div className="actions">
        <button onClick={() => save()} disabled={!user.trim() || !pass}>Save sign-in</button>
        {savedUser && <button className="ghost" onClick={() => save(true)}>Clear</button>}
        <span className="status">{status || (savedUser ? `Saved for ${savedUser}` : "Not saved")}</span>
      </div>
    </>
  );
}

/**
 * Using your own Gemini / Claude account instead of an API key: the laptop runs the official tool you signed into
 * (Gemini CLI / Claude Code). This panel installs it, opens its sign-in, and tests it.
 */
export function AccountSetup({ tool, model }: { tool: "gemini-cli" | "claude-code"; model: string }) {
  const [st, setSt] = useState<{ installed: boolean; version?: string; signedIn?: boolean; note?: string } | null>(null);
  const [busy, setBusy] = useState("");
  const name = tool === "gemini-cli" ? "Gemini CLI" : "Claude Code";
  const refresh = async (test = false) => {
    setBusy(test ? "Testing…" : "Checking…");
    try { setSt(await (await fetch(`/api/ai-account/status?tool=${tool}${test ? "&test=1" : ""}&model=${encodeURIComponent(model)}`)).json()); }
    catch { setSt({ installed: false, note: "Keep AutoResume open on the laptop: signed-in AI runs there." }); }
    setBusy("");
  };
  useEffect(() => { void refresh(); }, [tool]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="card" style={{ marginTop: 8 }}>
      <b>{name} on this laptop</b>
      <div className="small muted">
        {tool === "gemini-cli"
          ? "Uses your Google account's free Gemini quota instead of an API key. Google may use free-tier prompts (which include your resume and job text) to improve its products."
          : "Uses your Claude Pro / Max plan's limits instead of an API key."}
        {" "}Every AI action runs through the {name} tool on the laptop, in an empty temporary folder; phones and tablets go through the laptop too.
      </div>
      <div className="status">{busy || (!st ? "" : !st.installed ? `${name} isn't installed on this laptop.` : `${name} ${st.version || ""} installed${st.signedIn === true ? " · signed in and working ✓" : st.signedIn === false ? " · not signed in yet" : ""}`)}{st?.note ? ` · ${st.note}` : ""}</div>
      {isDesktop() ? (
        <div className="actions" style={{ margin: "8px 0 0" }}>
          {st && !st.installed && <button onClick={() => window.desktop!.accountTool(tool, "install")}>Install {name}</button>}
          {st?.installed && <button className={st.signedIn ? "ghost" : ""} onClick={() => window.desktop!.accountTool(tool, "login")}>{st.signedIn ? "Sign in again" : "Sign in"}</button>}
          <button className="ghost" disabled={!!busy} onClick={() => void refresh(true)} title="Sends one tiny request through your account">Test</button>
          <button className="ghost" disabled={!!busy} onClick={() => void refresh()}>Refresh</button>
        </div>
      ) : <div className="small muted">Install and sign in from the laptop app (Settings → AI).</div>}
      {isDesktop() && <div className="small muted">Install and Sign in open a terminal window on the laptop: follow the prompts there{tool === "gemini-cli" ? ' (choose "Login with Google")' : ""}, close it when done, then press Test.</div>}
    </div>
  );
}

/**
 * Model picker: every model the current key can see (provider's own models endpoint), with
 * list prices per 1M tokens (OpenRouter's public price list) and an on-demand availability check.
 */
export function ModelPicker({ state, update }: { state: State; update: Update }) {
  const provider = state.provider;
  const key = isAccount(provider) ? "account" : keyOf(state, provider);
  const picked = state.models?.[provider] || "";
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [prices, setPrices] = useState<Map<string, Price>>(new Map());
  const [health, setHealth] = useState<Record<string, { ok: boolean; ms: number; note: string } | "checking">>({});
  const [status, setStatus] = useState("");
  const [showAll, setShowAll] = useState(false);
  const load = async () => {
    setHealth({});
    if (!key) { setModels([]); setStatus("Add this provider's API key below to list its models."); return; }
    setStatus("Loading models…");
    try {
      const [m, p] = await Promise.all([listModels(provider, key), priceTable()]);
      setModels(m); setPrices(p);
      setStatus(`${m.filter((x) => x.usable).length} text models (${m.length} total) for this key.`);
    } catch (e) { setModels([]); setStatus((e as Error).message); }
  };
  useEffect(() => { void load(); }, [provider, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const setPick = (id: string) => update((s) => ({ ...s, models: { ...s.models, [provider]: id } }));
  const money = (n: number) => (n === 0 ? "free" : n < 0.1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`);
  const priceText = (id: string) => { const p = priceFor(provider, id, prices); return p ? `${money(p.input)} in / ${money(p.output)} out` : "price n/a"; };
  const healthText = (id: string) => { const h = health[id]; return !h ? "" : h === "checking" ? "checking…" : h.ok ? `✓ online ${h.ms}ms` : `✕ ${h.note}`; };
  const check = async (ids: string[]) => {
    setHealth((h) => ({ ...h, ...Object.fromEntries(ids.map((id) => [id, "checking" as const])) }));
    let next = 0;
    const worker = async () => {
      while (next < ids.length) {
        const id = ids[next++];
        const r = await pingModel({ provider, key, model: id });
        setHealth((h) => ({ ...h, [id]: r }));
      }
    };
    await Promise.all(Array.from({ length: 5 }, worker)); // 5 at a time
  };
  const usable = models.filter((m) => m.usable);
  const other = models.filter((m) => !m.usable);
  const savedMissing = picked && !models.some((m) => m.id === picked);
  const optionText = (m: ModelInfo) => [m.label, priceText(m.id), healthText(m.id)].filter(Boolean).join("  ·  ");
  return (
    <>
      <label>Model (prices are USD per 1M tokens)</label>
      <div className="row">
        <select value={picked} onChange={(e) => setPick(e.target.value)} style={{ flex: 1 }}>
          <option value="">Default: {PROVIDERS[provider].defaultModel}</option>
          {savedMissing && <option value={picked}>{picked} (saved, not in list)</option>}
          {usable.length > 0 && <optgroup label="Text models">{usable.map((m) => <option key={m.id} value={m.id}>{optionText(m)}</option>)}</optgroup>}
          {other.length > 0 && <optgroup label="Other models (audio, image, embedding: will not work here)">{other.map((m) => <option key={m.id} value={m.id}>{optionText(m)}</option>)}</optgroup>}
        </select>
        <button className="ghost" onClick={() => void load()}>Refresh list</button>
        <button className="ghost" disabled={!key} title="Uses AI tokens" onClick={() => { if (aiConfirm(state, "Send one tiny test request to the selected model?")) void check([picked || usable[0]?.id].filter(Boolean) as string[]); }}>✦ Test selected</button>
      </div>
      <div className="status">{status}{picked && healthText(picked) ? ` Selected: ${healthText(picked)}` : ""}</div>
      {models.length > 0 && (
        <details open={showAll} onToggle={(e) => setShowAll((e.target as HTMLDetailsElement).open)}>
          <summary className="small">All {models.length} models, prices and availability</summary>
          <div className="actions">
            <button className="ghost" title="Uses AI tokens" onClick={() => { if (aiConfirm(state, `Send one tiny test request to each of ${usable.length} models?`)) void check(usable.map((m) => m.id)); }}>✦ Check which text models are online ({usable.length})</button>
            <span className="small muted">Sends one tiny request per model; costs a fraction of a cent in total.</span>
          </div>
          <table className="models">
            <thead><tr><th>Model</th><th>Price per 1M tokens</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id} className={m.usable ? "" : "muted"}>
                  <td>{m.label}{m.usable ? "" : " (not for text)"}</td>
                  <td>{priceText(m.id)}</td>
                  <td>{healthText(m.id) || (m.usable ? <button className="ghost small" title="Uses AI tokens" onClick={() => { if (aiConfirm(state, `Send one tiny test request to ${m.id}?`)) void check([m.id]); }}>✦ Check</button> : "")}</td>
                  <td>{m.usable && (picked === m.id ? <b>In use</b> : <button className="ghost small" onClick={() => setPick(m.id)}>Use</button>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </>
  );
}
