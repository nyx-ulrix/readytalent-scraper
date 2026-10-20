import { PROVIDERS, isAccount, type SkillPrefs, type AiConfig, type Provider } from "./ai";
import { type Job, type State } from "./types";

export type KeyField = "geminiKey" | "openaiKey" | "qwenKey" | "anthropicKey" | "perplexityKey";

/** API-key providers -> the state field holding their key. Account providers (signed-in tools) have none. */
export const KEY_OF: Partial<Record<Provider, KeyField>> = { gemini: "geminiKey", openai: "openaiKey", qwen: "qwenKey", anthropic: "anthropicKey", perplexity: "perplexityKey" };

export const keyOf = (s: State, p: Provider) => (KEY_OF[p] ? (s[KEY_OF[p]!] as string | undefined) || "" : "");

/** "24 Sept 2026, 3:42 pm" for when a tailored resume / letter was generated; "" if unknown (made before timestamps). */
export const stamp = (s: State, kind: "resume" | "letter", jobId: string) => {
  const iso = s.generatedAt?.[`${kind}:${jobId}`];
  return iso ? new Date(iso).toLocaleString("en-SG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
};

export const aiCfg = (s: State): AiConfig => ({ provider: s.provider, key: isAccount(s.provider) ? "account" : keyOf(s, s.provider), model: s.models?.[s.provider] || "" });

export type Update = (patch: Partial<State> | ((s: State) => State)) => void;

export const PORTAL = "https://readytalent2.singaporetech.edu.sg/";

export const SOURCE_LABEL = { linkedin: "LinkedIn", indeed: "Indeed", pasted: "Pasted" } as const;

export const sourceOf = (j: Job) => (j.source ? SOURCE_LABEL[j.source] : "ReadyTalent");

/** Every AI action goes through this: nothing calls the AI without a click, and the user is told it costs tokens. */
export function aiConfirm(s: State, what: string): boolean {
  if (s.warnTokens === false) return true;
  const cfg = aiCfg(s);
  const model = cfg.model || PROVIDERS[cfg.provider].defaultModel;
  return window.confirm(`${what}\n\nThis sends data to ${PROVIDERS[cfg.provider].label} (${model}) and consumes API tokens, which may cost money.\n\nContinue?`);
}

/** Skill choices from ATS keywords: confirmed skills that this job asks for are added; "leave out" skills are removed everywhere. */
export const skillPrefs = (s: State, jobId: string): SkillPrefs => {
  const kw = new Set((s.keywords[jobId] || []).map((k) => k.toLowerCase()));
  return { include: (s.knownSkills || []).filter((k) => kw.has(k.toLowerCase())), omit: s.omitSkills || [] };
};

/** A lone pasted link (not a posting's text). */
export const LINK = /^https?:\/\/\S+$/i;
