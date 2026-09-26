import type { Job, Profile } from "./types";
import { fromMarkdown, toMarkdown } from "./markdown";
import { applySkillPrefs, groundProfile, inSource } from "./ground";
import { MAX_LEADERSHIP, MAX_PROJECTS, byRank, visible } from "./limits";

export type Provider = "gemini" | "openai" | "qwen" | "anthropic";
/** model: the exact model id the user picked in Settings; "" = the provider default below. */
export type AiConfig = { provider: Provider; key: string; model?: string };
type Attachment = { mimeType: string; data: string };

export const PROVIDERS: Record<Provider, { label: string; keyUrl: string; placeholder: string; defaultModel: string }> = {
  gemini: { label: "Google Gemini", keyUrl: "https://aistudio.google.com/apikey", placeholder: "AIza…", defaultModel: "gemini-flash-latest (falls back on quota)" },
  openai: { label: "OpenAI", keyUrl: "https://platform.openai.com/api-keys", placeholder: "sk-…", defaultModel: "gpt-4o-mini" },
  qwen: { label: "Qwen (Alibaba DashScope)", keyUrl: "https://modelstudio.console.alibabacloud.com/?tab=model#/api-key", placeholder: "sk-…", defaultModel: "qwen-plus (qwen-vl-plus for images)" },
  anthropic: { label: "Claude (Anthropic)", keyUrl: "https://console.anthropic.com/settings/keys", placeholder: "sk-ant-…", defaultModel: "claude-opus-5" },
};

const GEMINI_MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"];
const OPENAI_BASE = "https://api.openai.com/v1";
const QWEN_BASE = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const ANTHROPIC_HEADERS = (key: string) => ({ "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" });
const stripFences = (t: string) => t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

async function getJson(url: string, headers: Record<string, string>) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`Could not list models (${r.status}): ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

export type ModelInfo = { id: string; label: string; usable: boolean };

/** Every model this key can see. usable = works for text generation here (others are audio, image, embedding...). */
export async function listModels(provider: Provider, key: string): Promise<ModelInfo[]> {
  if (!key) throw new Error(`Add your ${PROVIDERS[provider].label} API key first.`);
  const sortUsable = (list: ModelInfo[]) => list.sort((x, y) => Number(y.usable) - Number(x.usable) || x.id.localeCompare(y.id));
  switch (provider) {
    case "gemini": {
      const out: ModelInfo[] = [];
      let page = "";
      do {
        const d = await getJson(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${page ? `&pageToken=${page}` : ""}`, { "x-goog-api-key": key });
        for (const m of d.models || []) {
          const id = String(m.name).replace(/^models\//, "");
          const usable = (m.supportedGenerationMethods || []).includes("generateContent") && !/(embedding|imagen|veo|tts|image-generation|native-audio|live)/.test(id);
          out.push({ id, label: m.displayName ? `${m.displayName} (${id})` : id, usable });
        }
        page = d.nextPageToken || "";
      } while (page);
      return sortUsable(out);
    }
    case "openai": {
      const d = await getJson(`${OPENAI_BASE}/models`, { Authorization: `Bearer ${key}` });
      return sortUsable((d.data || []).map((m: { id: string }) => ({
        id: m.id, label: m.id,
        usable: /^(gpt-|o\d|chatgpt-)/.test(m.id) && !/(audio|realtime|transcribe|tts|image|embedding|moderation|live|computer-use)/.test(m.id),
      })));
    }
    case "qwen": {
      const d = await getJson(`${QWEN_BASE}/models`, { Authorization: `Bearer ${key}` });
      return sortUsable((d.data || []).map((m: { id: string }) => ({
        id: m.id, label: m.id,
        usable: /^(qwen|qwq|qvq)/.test(m.id) && !/(embedding|tts|asr|audio|rerank|image|wanx|livetranslate|realtime)/.test(m.id),
      })));
    }
    case "anthropic": {
      const d = await getJson("https://api.anthropic.com/v1/models?limit=1000", ANTHROPIC_HEADERS(key));
      return (d.data || []).map((m: { id: string; display_name?: string }) => ({ id: m.id, label: m.display_name ? `${m.display_name} (${m.id})` : m.id, usable: true }));
    }
  }
}

/** USD per 1M tokens, from OpenRouter's public list (providers' own APIs do not publish prices). */
export type Price = { input: number; output: number };
let priceCache: Promise<Map<string, Price>> | null = null;
export function priceTable(): Promise<Map<string, Price>> {
  priceCache ??= fetch("https://openrouter.ai/api/v1/models")
    .then((r) => (r.ok ? r.json() : { data: [] }))
    .then((d) => new Map<string, Price>((d.data || []).map((m: { id: string; pricing?: { prompt?: string; completion?: string } }) =>
      [m.id, { input: Number(m.pricing?.prompt || 0) * 1e6, output: Number(m.pricing?.completion || 0) * 1e6 }])))
    .catch(() => { priceCache = null; return new Map<string, Price>(); });
  return priceCache;
}
const VENDOR: Record<Provider, string> = { gemini: "google", openai: "openai", qwen: "qwen", anthropic: "anthropic" };
export function priceFor(provider: Provider, id: string, table: Map<string, Price>): Price | undefined {
  const undated = id.replace(/-(\d{4}-\d{2}-\d{2}|\d{8})$/, "");
  const dotted = (x: string) => x.replace(/-(\d+)-(\d+)(?=$|-)/, "-$1.$2"); // claude-opus-4-8 -> claude-opus-4.8
  for (const c of [id, dotted(id), undated, dotted(undated), undated.replace(/-(latest|preview.*)$/, "")]) {
    const hit = table.get(`${VENDOR[provider]}/${c}`);
    if (hit) return hit;
  }
  return undefined;
}

/** Tiny live request to see if a model answers right now. Costs a few tokens. */
export async function pingModel(cfg: AiConfig): Promise<{ ok: boolean; ms: number; note: string }> {
  const t0 = performance.now();
  try {
    await Promise.race([
      ai(cfg, "Reply with the single word OK.", "Reply with the single word OK.", false),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timed out after 30s")), 30000)),
    ]);
    return { ok: true, ms: Math.round(performance.now() - t0), note: "online" };
  } catch (e) {
    const msg = (e as Error).message;
    const note = /429|quota|RESOURCE_EXHAUSTED|rate/i.test(msg) ? "rate-limited / no quota" : /404|not found|does not exist/i.test(msg) ? "not available" : /401|403|permission|access/i.test(msg) ? "no access" : msg.slice(0, 80);
    return { ok: false, ms: Math.round(performance.now() - t0), note };
  }
}

async function gemini(key: string, picked: string, prompt: string, system: string, json: boolean, file?: Attachment): Promise<string> {
  let last = "";
  // A picked model is used exactly; the default walks a short fallback list on quota errors.
  for (const model of picked ? [picked] : GEMINI_MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ parts: [...(file ? [{ inlineData: file }] : []), { text: prompt }] }],
        generationConfig: { temperature: 0.4, responseMimeType: json ? "application/json" : "text/plain" },
      }),
    });
    if (!picked && (r.status === 429 || r.status === 404)) { last = `${model}: ${r.status}`; continue; }
    if (!r.ok) throw new Error(`${model}: ${(await r.text()).slice(0, 300)}`);
    const data = await r.json();
    return (data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "").trim();
  }
  throw new Error(`Gemini unavailable (${last}). Free-tier quota? Try again in a minute.`);
}

/** OpenAI Responses API: needed for Responses-only models (Codex, "-pro", deep research). */
async function openaiResponses(key: string, model: string, prompt: string, system: string, json: boolean, file?: Attachment): Promise<string> {
  const content: unknown[] = [];
  if (file) {
    const url = `data:${file.mimeType};base64,${file.data}`;
    content.push(file.mimeType.startsWith("image/") ? { type: "input_image", image_url: url } : { type: "input_file", filename: "resume.pdf", file_data: url });
  }
  content.push({ type: "input_text", text: prompt });
  const r = await fetch(`${OPENAI_BASE}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, instructions: system, input: [{ role: "user", content }], ...(json ? { text: { format: { type: "json_object" } } } : {}) }),
  });
  if (!r.ok) throw new Error(`${model}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  const text = typeof data.output_text === "string" ? data.output_text
    : (data.output || []).flatMap((o: { content?: { type: string; text?: string }[] }) => o.content || []).filter((c: { type: string }) => c.type === "output_text").map((c: { text?: string }) => c.text || "").join("");
  return stripFences(text);
}
const RESPONSES_ONLY = /(codex|-pro|deep-research)/;

/** OpenAI and Qwen share the chat-completions shape. */
async function openaiCompatible(base: string, key: string, model: string, prompt: string, system: string, json: boolean, file?: Attachment): Promise<string> {
  const content: unknown[] = [];
  if (file) {
    if (file.mimeType.startsWith("image/")) content.push({ type: "image_url", image_url: { url: `data:${file.mimeType};base64,${file.data}` } });
    else if (base === OPENAI_BASE) content.push({ type: "file", file: { filename: "resume.pdf", file_data: `data:${file.mimeType};base64,${file.data}` } });
    else throw new Error("Qwen only accepts images here. Upload a photo/PNG of your resume, or switch provider to Gemini/Claude/OpenAI for PDFs.");
  }
  content.push({ type: "text", text: prompt });
  // Reasoning models (o1/o3/o4, gpt-5) reject a custom temperature.
  const temperature = /^(o\d|gpt-5)/.test(model) ? {} : { temperature: 0.4 };
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, ...temperature, messages: [{ role: "system", content: system }, { role: "user", content }], ...(json ? { response_format: { type: "json_object" } } : {}) }),
  });
  if (!r.ok) {
    const err = await r.text();
    // Some OpenAI models only exist on the Responses API; retry there.
    if (base === OPENAI_BASE && /v1\/responses|not a chat model|not supported in the v1\/chat/i.test(err)) return openaiResponses(key, model, prompt, system, json, file);
    throw new Error(`${model}: ${err.slice(0, 300)}`);
  }
  const data = await r.json();
  return stripFences(data.choices?.[0]?.message?.content || "");
}

async function anthropic(key: string, model: string, prompt: string, system: string, json: boolean, file?: Attachment): Promise<string> {
  const content: unknown[] = [];
  if (file) content.push({ type: file.mimeType === "application/pdf" ? "document" : "image", source: { type: "base64", media_type: file.mimeType, data: file.data } });
  content.push({ type: "text", text: json ? `${prompt}\n\nRespond with valid JSON only, no markdown.` : prompt });
  // Server-side refusal fallbacks exist only on the newest models; other picks are sent plain.
  const fallback = /^claude-(opus-5|fable-5)/.test(model);
  const send = (max_tokens: number) => fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ANTHROPIC_HEADERS(key), ...(fallback ? { "anthropic-beta": "server-side-fallback-2026-07-01" } : {}) },
    body: JSON.stringify({ model, max_tokens, ...(fallback ? { fallbacks: "default" } : {}), system, messages: [{ role: "user", content }] }),
  });
  let r = await send(16000);
  if (r.status === 400) {
    const err = await r.text();
    if (!/max_tokens/i.test(err)) throw new Error(`${model}: ${err.slice(0, 300)}`);
    r = await send(4096); // older models cap output lower
  }
  if (!r.ok) throw new Error(`${model}: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  if (data.stop_reason === "refusal") throw new Error(`Claude declined: ${data.stop_details?.explanation || "refusal"}`);
  return stripFences((data.content || []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join(""));
}

export async function ai(cfg: AiConfig, prompt: string, system: string, json = false, file?: Attachment): Promise<string> {
  if (!cfg.key) throw new Error(`Add your ${PROVIDERS[cfg.provider].label} API key in Settings first.`);
  const picked = (cfg.model || "").trim();
  switch (cfg.provider) {
    case "gemini": return gemini(cfg.key, picked, prompt, system, json, file);
    case "openai": {
      const model = picked || "gpt-4o-mini";
      return RESPONSES_ONLY.test(model) ? openaiResponses(cfg.key, model, prompt, system, json, file) : openaiCompatible(OPENAI_BASE, cfg.key, model, prompt, system, json, file);
    }
    case "qwen": {
      // Image import needs a vision model; keep the pick if it is one.
      const model = file ? (/(vl|omni|qvq)/.test(picked) ? picked : "qwen-vl-plus") : picked || "qwen-plus";
      return openaiCompatible(QWEN_BASE, cfg.key, model, prompt, system, json, file);
    }
    case "anthropic": return anthropic(cfg.key, picked || "claude-opus-5", prompt, system, json, file);
  }
}

const jobText = (j: Job) =>
  JSON.stringify({ title: j.title, company: j.company, type: j.type, location: j.location, skills: j.skills, description: j.description.slice(0, 6000), requirements: j.requirements.slice(0, 3000) });

const SYSTEM = `You are an expert resume writer and ATS (applicant tracking system) keyword specialist.
Hard rule: every fact you write - employers, roles, schools, dates, locations, skills, tools, languages, certifications, numbers and achievements - must be stated in the candidate's source material (their resume and their own notes). You may reword, reorder, condense and emphasise, and you may name a soft skill that a stated fact clearly demonstrates, but never add a fact, tool, metric or outcome they did not state. Never invent percentages or counts.`;

/** The candidate's source of truth, as Markdown: their resume plus the free-text notes they typed. */
export function sourceText(profile: Profile, notes: string): string {
  return toMarkdown(profile, false) + (notes.trim() ? `\n## Notes from the candidate (not printed; usable facts)\n\n${notes.trim()}\n` : "");
}

export async function extractKeywords(cfg: AiConfig, job: Job, source: string): Promise<string[]> {
  const out = await ai(cfg, `List 20-30 ATS keywords for this application, most important first, using the job posting's own wording.
Include: hard skills, tools, certifications, domain terms, the soft skills the posting stresses (teamwork, communication, problem solving, adaptability, attention to detail...), and any languages it asks for (e.g. Mandarin / Chinese, Malay).
Then read the candidate's resume and notes below and ADD every qualification of theirs that this job would value, especially languages (e.g. Mandarin, Chinese) and soft skills, phrased the way the posting or ATS would search for them.
Return JSON: {"keywords": [string, ...]}.

Job: ${jobText(job)}

Candidate resume and notes (Markdown):
${source}`, SYSTEM, true);
  const parsed = JSON.parse(out);
  const arr = Array.isArray(parsed) ? parsed : parsed.keywords;
  return Array.isArray(arr) ? [...new Set(arr.map(String).map((k: string) => k.trim()).filter(Boolean))] : [];
}

/**
 * Read a job posting the user pasted. The AI only fills the fields; the posting text itself becomes the
 * description, and listed skills must appear in it.
 */
export async function readPosting(cfg: AiConfig, text: string): Promise<Pick<Job, "title" | "company" | "location" | "salary" | "deadline" | "requirements" | "skills" | "employment" | "workplace" | "level">> {
  const out = await ai(cfg, `Extract the details of this job posting. Copy the posting's own wording; use "" or [] when something is not stated.
Return JSON: {"title", "company", "location", "salary", "deadline", "employment" (one of "Full-time", "Part-time", "Contract", "Temporary", "Internship" or ""), "workplace" (one of "On-site", "Remote", "Hybrid" or ""), "level" (e.g. "Internship", "Entry level", "Mid-Senior level" or ""), "requirements" (the requirements / qualifications, one per line), "skills" (string[]: the skills, tools and qualifications asked for, as short names)}.

Posting:
${text.slice(0, 30000)}`, "You extract structured data from job postings. Never invent details.", true);
  const p = JSON.parse(out) as Record<string, unknown>;
  const s = (k: string) => (typeof p[k] === "string" ? (p[k] as string).trim() : "");
  const skills = Array.isArray(p.skills) ? [...new Set(p.skills.map(String).map((x) => x.trim()).filter((x) => x && inSource(x, text)))] : [];
  return { title: s("title"), company: s("company"), location: s("location"), salary: s("salary"), deadline: s("deadline"), requirements: s("requirements"), skills, employment: s("employment"), workplace: s("workplace"), level: s("level") };
}

export function matchKeywords(keywords: string[], text: string) {
  const hit = keywords.filter((k) => inSource(k, text));
  return { hit, miss: keywords.filter((k) => !hit.includes(k)) };
}

/** The profile JSON shape, spelled out for the model. */
const PROFILE_SHAPE = `name, email, phone, location, portfolio (personal website URL), linkedin (LinkedIn URL), github (GitHub profile URL), links (any other links joined with " · "), summary, skills (string[]: technical skills only), experience, projects, education (arrays of entries), awards (string[]: certifications and awards), sections (array of {title, entries} for any other section such as "Competition" or "Leadership & Co-Curricular Activities"), additional (string[] of labelled lines such as "Soft Skills: A | B" or "Interests: X, Y"). Every entry is {title, org, location, dates, details: string[]}; for education, title is the degree and org is the school (with faculty); for experience, title is the role and org is the company; for projects, title is the project name and org is the tech stack.`;

const arrOr = <T,>(v: unknown, fb: T[]): T[] => (Array.isArray(v) ? (v as T[]) : fb);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Second pass: an independent fact-check of the draft against the source, fixing or removing unsupported claims. */
async function factCheck(cfg: AiConfig, source: string, draft: string, json: boolean): Promise<string> {
  return ai(cfg, `Fact-check this ${json ? "resume JSON" : "cover letter"} against the candidate's source material.
For every sentence, bullet, skill and summary line: if any part is not stated in the source (or is a soft skill not clearly demonstrated by a stated fact), rewrite it so it is fully supported, or delete it. Keep everything that is supported, including the ATS wording and soft skills. Do not add anything new.
Return ${json ? "the corrected JSON with exactly the same keys and structure" : "only the corrected letter as plain text"}.

Source (Markdown):
${source}

Draft:
${draft}`, SYSTEM, json);
}

export type SkillPrefs = { include: string[]; omit: string[] };
const prefsText = (p?: SkillPrefs) => (p ? `${p.include.length ? `\nThe candidate confirmed they have these skills; list them first on the skills line (within the 18): ${JSON.stringify(p.include)}` : ""}${p.omit.length ? `\nThe candidate asked to leave these out; do not mention them anywhere: ${JSON.stringify(p.omit)}` : ""}` : "");
/** Confirmed skills count as facts the candidate stated. */
const withConfirmed = (notes: string, p?: SkillPrefs) => (p?.include.length ? `${notes}\nSkills I confirm I have: ${p.include.join(", ")}` : notes);

export async function tailorResume(cfg: AiConfig, profile: Profile, job: Job, keywords: string[], notes: string, prefs?: SkillPrefs): Promise<Profile> {
  const source = sourceText(profile, withConfirmed(notes, prefs));
  const draft = await ai(cfg, `Curate this candidate's resume for ONE job. A recruiter will scan it for about 30 seconds and must see, in the top half of the page, why this candidate fits THIS role.

Return JSON with the same keys as the profile JSON: ${PROFILE_SHAPE}
For every entry you keep, copy its title, org, location and dates exactly. List only what should appear on the page; anything you leave out is still stored, just not shown.

SELECT (what appears)
- Education and work experience: keep every entry.
- Projects: at most ${MAX_PROJECTS}. Leadership / co-curricular: at most ${MAX_LEADERSHIP}.
- Choose and order projects, leadership and other sections in this priority:
  1. Relevance gate: only entries relevant enough to this job's requirements are candidates.
  2. Built-in rules, which apply even over the candidate's ranking: substantial, role-relevant work beats coursework, module assignments and small practice projects; completed roles beat upcoming ones.
  3. The candidate's ranking: every list is in the candidate's own order, first = what they most want to showcase. Among the remaining candidates, pick and order by that ranking; put a lower-ranked entry ahead only when it is clearly more relevant.
- Projects and extra-section entries with "onlyIfVeryRelevant": true are ones the candidate does not find impressive: leave them out unless they are a near-direct match for this job's core requirements that no other entry covers.
- Hackathons: when a project was built at a hackathon listed in another section, show that work once, as the hackathon entry: merge the project's most job-relevant bullet and tools into the hackathon entry (keeping its ATS keywords) and leave the duplicate project out of Projects. Keep other extra-section entries only if they add something not already shown; return a section with an empty "entries" list if nothing is left.

WRITE (how it reads)
- summary: 2 sentences, 35-55 words. Open with who they are and the role type they are applying for, then their 2-3 strongest pieces of evidence for this job. No list of technologies, no generic claims ("passionate", "proven", "strong foundation"), no mention of interests.
- Bullets: education 0-1 (relevant coursework only), work experience 2-3, projects 2-3, leadership 1-2. The word limit under FIT wins: if these would go over it, write fewer bullets, down to the minimums. Each bullet is one line or a little more: strong verb + what was built or done + how (the tools that matter for this job) + result, but only a result the source states. Lead each entry with its most job-relevant bullet.
- Reframe, don't invent: for business-analyst roles stress requirements, stakeholders, documentation and data quality; for engineering roles stress design, integration, testing and debugging; for performance roles stress measurement and benchmarking methodology; for data/security roles stress data validation, access control, audit and credential handling. Use only what the source supports.
- Tone down claims the source does not back with evidence: avoid "zero-downtime", "secure", "production-ready", "high-quality", "near-optimal", "optimised", "robust" unless the source gives a measurement or mechanism; describe the mechanism instead (e.g. "deploys behind a Caddy reverse proxy with rollbacks").
- Name a soft skill only where a stated fact shows it (e.g. coordinating design, QA and localisation teams -> cross-functional communication). Aim to show 3-5 relevant soft skills across the page.

SKILLS
- skills: the 12-18 technical skills most relevant to this job, most relevant first, only from the source; skills the candidate confirmed (below) come first and count toward the 18. No soft skills, languages or job-description phrases here.
- additional: at most 3 lines: "Soft Skills: ..." (at most 5, relevant to the job), "Languages: ..." (from the source or notes, e.g. English | Mandarin), and one more line only if the job needs it. Drop "Interests" unless it directly helps.
- ATS keywords: use a keyword only where the candidate's experience shows it, in the job's own wording, inside bullets or the skills line. Never paste a list of keywords, and never add a keyword just because the job mentions it.

FIT
- The page must fit ONE A4 page at readable size: 380-480 words in total. This limit wins over the bullet counts above.
- Use only numbers that appear in the source.${prefsText(prefs)}

ATS keywords: ${JSON.stringify(keywords)}
Job: ${jobText(job)}

Candidate source (Markdown, the only facts you may use):
${source}

Profile JSON to transform:
${JSON.stringify(profile)}`, SYSTEM, true);
  const checked = await factCheck(cfg, source, draft, true);
  const grounded = groundProfile(profile, JSON.parse(checked) as Partial<Profile>, source);
  return prefs ? applySkillPrefs(grounded, prefs) : grounded;
}

const isText = (f: File) => /\.(md|markdown|txt)$/i.test(f.name) || /^text\//.test(f.type);

/** OCR + parse an existing resume (PDF, image, or Markdown/plain text) into the profile shape. */
export async function parseResume(cfg: AiConfig, file: File): Promise<Profile> {
  const ask = `Read this resume${isText(file) ? "" : " (OCR if scanned)"} and extract the candidate's details. Return JSON with exactly these keys: ${PROFILE_SHAPE} Copy facts verbatim; use "" or [] when absent.`;
  const system = "You extract structured data from resumes. Never invent details.";
  let out: string;
  if (isText(file)) {
    const text = await file.text();
    if (!text.trim()) throw new Error("That file is empty.");
    const exact = fromMarkdown(text); // AutoResume's own template: no AI needed
    if (exact) return exact;
    out = await ai(cfg, `${ask}\n\nResume (Markdown):\n${text}`, system, true);
  } else {
    const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/png");
    if (!/^(application\/pdf|image\/)/.test(mime)) throw new Error("Upload a PDF, an image (PNG/JPG) or a Markdown (.md) file of your resume.");
    const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
    out = await ai(cfg, ask, system, true, { mimeType: mime, data });
  }
  const p = JSON.parse(out) as Partial<Profile>;
  const strs = (v: unknown) => arrOr<unknown>(v, []).map(String).filter(Boolean);
  const entries = (v: unknown) => arrOr<Record<string, unknown>>(v, []).map((e) => ({ title: str(e.title), org: str(e.org), location: str(e.location), dates: str(e.dates), details: strs(e.details) }));
  return {
    name: str(p.name), email: str(p.email), phone: str(p.phone), location: str(p.location),
    portfolio: str(p.portfolio), linkedin: str(p.linkedin), github: str(p.github), links: str(p.links), summary: str(p.summary),
    skills: strs(p.skills), experience: entries(p.experience), projects: entries(p.projects), education: entries(p.education), awards: strs(p.awards),
    sections: arrOr<Record<string, unknown>>(p.sections, []).map((s) => ({ title: str(s.title), entries: entries(s.entries) })).filter((s) => s.title),
    additional: strs(p.additional),
  };
}

export async function coverLetter(cfg: AiConfig, profile: Profile, job: Job, keywords: string[], notes: string, tailored?: Profile, prefs?: SkillPrefs): Promise<string> {
  const source = sourceText(profile, withConfirmed(notes, prefs));
  const draft = await ai(cfg, `Write a cover letter (250-350 words, 3-4 paragraphs) from the candidate to ${job.company} for the ${job.title} role. Specific, warm, professional.
Use as many of the ATS keywords and soft skills as the source supports, each tied to a stated experience; mention languages from the notes (e.g. Mandarin / Chinese) if the job values them. Use only facts and numbers from the source. No placeholders like [Company].${prefsText(prefs)} Start with "Dear Hiring Manager," and end with "Sincerely," and the candidate's name. Plain text only.
ATS keywords: ${JSON.stringify(keywords)}
Job: ${jobText(job)}
${tailored ? `Tailored resume emphasis for this job (wording only; facts must still come from the source):\n${toMarkdown(visible(tailored), false)}\n` : ""}
Candidate source (Markdown, the only facts you may use):
${source}`, SYSTEM);
  const checked = await factCheck(cfg, source, draft, false);
  return checked.trim() || draft;
}

const listFrom = (out: string, key: string): string[] => {
  const parsed = JSON.parse(out);
  const arr = Array.isArray(parsed) ? parsed : parsed[key];
  return Array.isArray(arr) ? [...new Set(arr.map(String).map((x: string) => x.trim()).filter(Boolean))] : [];
};

/** Roles that fit the candidate's resume, excluding ones they already listed. */
/**
 * Rank the candidate's own lists (projects, each extra section, skills) by relevance to the roles they want.
 * Only the order changes: nothing is rewritten or removed, and the page shows the top of each list.
 */
export async function rankProfile(cfg: AiConfig, profile: Profile, roles: string[], notes: string): Promise<(p: Profile) => Profile> {
  const brief = {
    projects: profile.projects.map((e) => ({ title: e.title, stack: e.org, points: e.details })),
    sections: (profile.sections || []).map((s) => ({ title: s.title, entries: s.entries.map((e) => ({ title: e.title, dates: e.dates, points: e.details })) })),
    skills: profile.skills,
  };
  const out = await ai(cfg, `Rank this candidate's resume items by how strongly they support ${roles.length ? `these target roles: ${JSON.stringify(roles)}` : "the roles their resume fits best"}.
Most relevant first. Prefer substantial, role-relevant work with concrete results over coursework and small practice projects; completed roles over upcoming ones; technical skills that the target roles use over generic ones.
Return JSON {"projects": [title, ...], "sections": [{"title": section title, "entries": [title, ...]}], "skills": [skill, ...]} listing EVERY item exactly as written (same spelling), just reordered.
${notes.trim() ? `Candidate notes: ${notes}\n` : ""}Items:
${JSON.stringify(brief)}`, "You rank resume content for recruiters. You never add, rename or drop items.", true);
  const r = JSON.parse(out) as { projects?: unknown; sections?: { title?: string; entries?: unknown }[]; skills?: unknown };
  const secs = Array.isArray(r.sections) ? r.sections : [];
  // Applied to the profile as it is when the answer arrives, so edits made meanwhile are kept.
  return (p) => ({
    ...p,
    projects: byRank(p.projects, r.projects, (e) => e.title),
    sections: (p.sections || []).map((s) => ({ ...s, entries: byRank(s.entries, secs.find((x) => String(x?.title || "").toLowerCase().trim() === s.title.toLowerCase().trim())?.entries, (e) => e.title) })),
    skills: byRank(p.skills, r.skills, (s) => s),
  });
}

export async function suggestRoles(cfg: AiConfig, source: string, interests: string[]): Promise<string[]> {
  const out = await ai(cfg, `Suggest 10 job roles this candidate is a strong fit for right now, based only on their resume and notes. Mix direct fits and realistic stretch roles; include internship-level titles if they are a student. Use common job-board titles.
Already interested in (do not repeat): ${JSON.stringify(interests)}
Return JSON: {"roles": [string, ...]}.

Candidate (Markdown):
${source}`, "You are a career coach who knows how jobs are titled on LinkedIn and Indeed.", true);
  const have = new Set(interests.map((r) => r.toLowerCase()));
  return listFrom(out, "roles").filter((r) => !have.has(r.toLowerCase()));
}

/**
 * A specific job title the user wants: a typical posting for it (what such jobs ask for), the search queries
 * that find it and its near-identical roles, and the distinctive keywords used to rank results by similarity.
 */
export async function targetRole(cfg: AiConfig, title: string, location: string): Promise<{ posting: string; terms: string[]; keywords: string[] }> {
  const out = await ai(cfg, `The candidate wants jobs as: "${title}"${location ? ` (in ${location})` : ""}.
1. Write a realistic, typical job posting for exactly this role as employers there usually advertise it: a one-line overview, "Responsibilities" (5-7 bullets), "Requirements" (5-7 bullets: skills, tools, qualifications, experience level) and "Nice to have" (2-3 bullets). Plain text, no company name, no salary.
2. Write 10-12 job-board search queries (2-4 words each) that find this role and jobs that are really the same work: the exact title, the other titles employers use for it (e.g. "Solutions Engineer" for "Forward Deployed Engineer"), and title + core skill combinations. Keep them specific to this role, not generic.
3. List 15-25 distinctive keywords of this role (tools, skills, domain terms, typical title words) that a matching posting would contain. Short names only.
Return JSON: {"posting": string, "terms": [string, ...], "keywords": [string, ...]}.`, "You know how jobs are advertised on LinkedIn and Indeed and which titles mean the same work.", true);
  const p = JSON.parse(out) as { posting?: unknown; terms?: unknown; keywords?: unknown };
  const list = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(String).map((x) => x.trim()).filter(Boolean))] : []);
  return { posting: typeof p.posting === "string" ? p.posting.trim() : "", terms: list(p.terms), keywords: list(p.keywords) };
}

/** Short LinkedIn / Indeed queries built from the roles the user wants plus their resume. */
export async function generateSearchTerms(cfg: AiConfig, source: string, interests: string[], existing: string[]): Promise<string[]> {
  const out = await ai(cfg, `Write 12 job-board search queries (2-4 words each) for LinkedIn and Indeed.
Weight them heavily toward the roles the candidate wants: ${JSON.stringify(interests)}.
Also cover the synonyms recruiters use for those roles, and role + key skill combinations from their resume (e.g. "Python data analyst"). Add internship variants if they are a student. Do not repeat these existing queries: ${JSON.stringify(existing)}.
Return JSON: {"terms": [string, ...]}.

Candidate (Markdown):
${source}`, "You write precise job-board search queries.", true);
  const have = new Set(existing.map((t) => t.toLowerCase()));
  return listFrom(out, "terms").filter((t) => !have.has(t.toLowerCase()));
}
