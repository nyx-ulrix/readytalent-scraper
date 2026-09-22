import type { Job, Profile } from "./types";

export type Provider = "gemini" | "openai" | "qwen" | "anthropic";
export type AiConfig = { provider: Provider; key: string };
type Attachment = { mimeType: string; data: string };

export const PROVIDERS: Record<Provider, { label: string; keyUrl: string; placeholder: string }> = {
  gemini: { label: "Google Gemini", keyUrl: "https://aistudio.google.com/apikey", placeholder: "AIza…" },
  openai: { label: "OpenAI", keyUrl: "https://platform.openai.com/api-keys", placeholder: "sk-…" },
  qwen: { label: "Qwen (Alibaba DashScope)", keyUrl: "https://modelstudio.console.alibabacloud.com/?tab=model#/api-key", placeholder: "sk-…" },
  anthropic: { label: "Claude (Anthropic)", keyUrl: "https://console.anthropic.com/settings/keys", placeholder: "sk-ant-…" },
};

const GEMINI_MODELS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"];
const stripFences = (t: string) => t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

async function gemini(key: string, prompt: string, system: string, json: boolean, file?: Attachment): Promise<string> {
  let last = "";
  for (const model of GEMINI_MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ parts: [...(file ? [{ inlineData: file }] : []), { text: prompt }] }],
        generationConfig: { temperature: 0.4, responseMimeType: json ? "application/json" : "text/plain" },
      }),
    });
    if (r.status === 429 || r.status === 404) { last = `${model}: ${r.status}`; continue; }
    if (!r.ok) throw new Error((await r.text()).slice(0, 300));
    const data = await r.json();
    return (data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "").trim();
  }
  throw new Error(`Gemini unavailable (${last}). Free-tier quota? Try again in a minute.`);
}

/** OpenAI and Qwen share the chat-completions shape. */
async function openaiCompatible(base: string, key: string, model: string, prompt: string, system: string, json: boolean, file?: Attachment): Promise<string> {
  const content: unknown[] = [];
  if (file) {
    if (file.mimeType.startsWith("image/")) content.push({ type: "image_url", image_url: { url: `data:${file.mimeType};base64,${file.data}` } });
    else if (base.includes("openai.com")) content.push({ type: "file", file: { filename: "resume.pdf", file_data: `data:${file.mimeType};base64,${file.data}` } });
    else throw new Error("Qwen only accepts images here. Upload a photo/PNG of your resume, or switch provider to Gemini/Claude/OpenAI for PDFs.");
  }
  content.push({ type: "text", text: prompt });
  const r = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, temperature: 0.4, messages: [{ role: "system", content: system }, { role: "user", content }], ...(json ? { response_format: { type: "json_object" } } : {}) }),
  });
  if (!r.ok) throw new Error((await r.text()).slice(0, 300));
  const data = await r.json();
  return stripFences(data.choices?.[0]?.message?.content || "");
}

async function anthropic(key: string, prompt: string, system: string, json: boolean, file?: Attachment): Promise<string> {
  const content: unknown[] = [];
  if (file) content.push({ type: file.mimeType === "application/pdf" ? "document" : "image", source: { type: "base64", media_type: file.mimeType, data: file.data } });
  content.push({ type: "text", text: json ? `${prompt}\n\nRespond with valid JSON only, no markdown.` : prompt });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-beta": "server-side-fallback-2026-07-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: "claude-opus-5", max_tokens: 16000, fallbacks: "default", system, messages: [{ role: "user", content }] }),
  });
  if (!r.ok) throw new Error((await r.text()).slice(0, 300));
  const data = await r.json();
  if (data.stop_reason === "refusal") throw new Error(`Claude declined: ${data.stop_details?.explanation || "refusal"}`);
  return stripFences((data.content || []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join(""));
}

export async function ai(cfg: AiConfig, prompt: string, system: string, json = false, file?: Attachment): Promise<string> {
  if (!cfg.key) throw new Error(`Add your ${PROVIDERS[cfg.provider].label} API key in Settings first.`);
  switch (cfg.provider) {
    case "gemini": return gemini(cfg.key, prompt, system, json, file);
    case "openai": return openaiCompatible("https://api.openai.com/v1", cfg.key, "gpt-4o-mini", prompt, system, json, file);
    case "qwen": return openaiCompatible("https://dashscope-intl.aliyuncs.com/compatible-mode/v1", cfg.key, file ? "qwen-vl-plus" : "qwen-plus", prompt, system, json, file);
    case "anthropic": return anthropic(cfg.key, prompt, system, json, file);
  }
}

const jobText = (j: Job) =>
  JSON.stringify({ title: j.title, company: j.company, type: j.type, location: j.location, skills: j.skills, description: j.description.slice(0, 6000), requirements: j.requirements.slice(0, 3000) });

const SYSTEM = "You are an expert resume writer and ATS (applicant tracking system) keyword optimisation specialist. Never invent employers, degrees, dates, tools or achievements the candidate did not list. Rewrite wording, ordering and emphasis only.";

export async function extractKeywords(cfg: AiConfig, job: Job): Promise<string[]> {
  const out = await ai(cfg, `Extract 15-25 ATS keywords from this job posting: hard skills, tools, certifications, domain terms and the soft skills it stresses. Most important first. Return JSON: {"keywords": [string, ...]}.\n\nJob: ${jobText(job)}`, SYSTEM, true);
  const parsed = JSON.parse(out);
  const arr = Array.isArray(parsed) ? parsed : parsed.keywords;
  return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
}

export function matchKeywords(keywords: string[], text: string) {
  const t = text.toLowerCase();
  const hit = keywords.filter((k) => t.includes(k.toLowerCase()));
  return { hit, miss: keywords.filter((k) => !hit.includes(k)) };
}

export async function tailorResume(cfg: AiConfig, profile: Profile, job: Job, keywords: string[]): Promise<Profile> {
  const out = await ai(cfg, `Tailor this candidate's resume for the job. Return JSON with EXACTLY the same shape and keys as the profile (name, email, phone, location, links, summary, skills[], experience[], education[], projects[], awards[]; entries have title, org, dates, details[]).
Rules: keep contact details, employers, dates and degrees unchanged. Write a 3-line summary targeted at the role. Reorder skills so the job's keywords the candidate genuinely has come first; add a keyword only if the candidate's history clearly shows it. Rewrite bullets with strong action verbs and measurable impact, weaving in the ATS keywords naturally. Fit one A4 page (max ~4 bullets per entry).
ATS keywords: ${JSON.stringify(keywords)}
Profile: ${JSON.stringify(profile)}
Job: ${jobText(job)}`, SYSTEM, true);
  const p = JSON.parse(out) as Partial<Profile>;
  const arr = <T,>(v: unknown, fb: T[]): T[] => (Array.isArray(v) ? (v as T[]) : fb);
  return { ...profile, ...p, skills: arr(p.skills, profile.skills), experience: arr(p.experience, profile.experience), education: arr(p.education, profile.education), projects: arr(p.projects, profile.projects), awards: arr(p.awards, profile.awards) };
}

/** OCR + parse an existing resume (PDF or image) into the profile shape. The model reads the file directly. */
export async function parseResume(cfg: AiConfig, file: File): Promise<Profile> {
  const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/png");
  if (!/^(application\/pdf|image\/)/.test(mime)) throw new Error("Upload a PDF or an image (PNG/JPG) of your resume.");
  const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
  const out = await ai(cfg, `Read this resume (OCR if scanned) and extract the candidate's details. Return JSON with exactly these keys: name, email, phone, location, links (all links joined with " · "), summary, skills (string[]), experience, projects, education (arrays of {title, org, dates, details: string[]}), awards (string[]). Copy facts verbatim; use "" or [] when absent.`,
    "You extract structured data from resumes. Never invent details.", true, { mimeType: mime, data });
  const p = JSON.parse(out) as Partial<Profile>;
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return { name: str(p.name), email: str(p.email), phone: str(p.phone), location: str(p.location), links: str(p.links), summary: str(p.summary), skills: arr<string>(p.skills).map(String), experience: arr(p.experience), projects: arr(p.projects), education: arr(p.education), awards: arr<string>(p.awards).map(String) };
}

export function coverLetter(cfg: AiConfig, profile: Profile, job: Job, keywords: string[]): Promise<string> {
  return ai(cfg, `Write a cover letter (250-350 words, 3-4 paragraphs) from the candidate to ${job.company} for the ${job.title} role. Specific, warm, professional. Use the ATS keywords naturally where the candidate's background supports them. No placeholders like [Company]. Start with "Dear Hiring Manager," and end with "Sincerely," and the candidate's name. Plain text only.
ATS keywords: ${JSON.stringify(keywords)}
Candidate: ${JSON.stringify(profile)}
Job: ${jobText(job)}`, SYSTEM);
}
