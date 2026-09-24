export type Job = {
  id: string; title: string; company: string; type: string; salary: string; location: string;
  programmes?: string[];
  skills: string[]; description: string; requirements: string; deadline: string; posted: string;
  vacancies: string; website: string; companyProfile: string; active: boolean; expired?: boolean; scrapedAt: string;
};
export type Entry = { title: string; org: string; location?: string; dates: string; details: string[] };
/** Extra resume sections beyond the built-in ones, e.g. "Competition", "Leadership & Co-Curricular Activities". */
export type Section = { title: string; entries: Entry[] };
export type Profile = {
  name: string; email: string; phone: string; location: string; links: string; summary: string;
  skills: string[]; experience: Entry[]; education: Entry[]; projects: Entry[]; awards: string[];
  sections: Section[];
  /** Labelled lines under the skills, e.g. "Soft Skills: Analytical Thinking | Communication". */
  additional: string[];
};
export type Template = "standard" | "classic" | "modern" | "compact";
export type State = {
  profile: Profile; template: Template;
  /** Bumped when a default changes so saved state picks it up once (2 = "standard" template). */
  defaultsVersion: number;
  /** Which AI provider to use and one key per provider (all stored locally). */
  provider: "gemini" | "openai" | "qwen" | "anthropic";
  geminiKey: string; openaiKey: string; qwenKey: string; anthropicKey: string;
  tailored: Record<string, Profile>; covers: Record<string, string>; keywords: Record<string, string[]>; saved: string[];
  /** Job list filters, copied from the portal's Employment Types / Programmes dropdowns. */
  employmentType: string; course: string;
  /** Skill filters (lower-cased): jobs must list every "want" skill and none of the "avoid" ones. */
  skillsWant: string[]; skillsAvoid: string[];
};
export type Meta = { employmentTypes: string[]; programmes: string[] };
/** Shown until the first scrape replaces them with the portal's exact dropdown lists. Types from the RT2 Student User Guide; programmes from SIT's public programme list in the portal's naming style. */
export const DEFAULT_META: Meta = {
  employmentTypes: [
    "Full-Time", "Part-Time", "Internship", "Industry Attachment (IA)", "Industry Induction (II)",
    "Integrated Work Study Programme (IWSP)", "Overseas Integrated Work Study Programme (OIWSP)",
    "SkillsFuture Work Study Degree Programme (WSDP)", "SIT Student Work Scheme", "Other Work Attachment",
  ],
  programmes: [
    "Bachelor of Accountancy (Hons)",
    "Bachelor of Arts (Hons) in Digital Art and Animation",
    "Bachelor of Business (Hons) in Hospitality Business",
    "Bachelor of Engineering (Hons) in Aerospace Engineering",
    "Bachelor of Engineering (Hons) in Aircraft Systems Engineering",
    "Bachelor of Engineering (Hons) in Chemical Engineering",
    "Bachelor of Engineering (Hons) in Civil Engineering",
    "Bachelor of Engineering (Hons) in Computer Engineering",
    "Bachelor of Engineering (Hons) in Electrical and Electronic Engineering",
    "Bachelor of Engineering (Hons) in Electrical Power Engineering",
    "Bachelor of Engineering (Hons) in Electronics and Data Engineering",
    "Bachelor of Engineering (Hons) in Infrastructure and Systems Engineering",
    "Bachelor of Engineering (Hons) in Mechanical Design and Manufacturing Engineering",
    "Bachelor of Engineering (Hons) in Mechanical Engineering",
    "Bachelor of Engineering (Hons) in Mechatronics Systems",
    "Bachelor of Engineering (Hons) in Naval Architecture and Marine Engineering",
    "Bachelor of Engineering (Hons) in Pharmaceutical Engineering",
    "Bachelor of Engineering (Hons) in Robotics Systems",
    "Bachelor of Engineering (Hons) in Sustainable Infrastructure Engineering (Land)",
    "Bachelor of Engineering (Hons) in Systems Engineering (ElectroMechanical Systems)",
    "Bachelor of Food Technology (Hons)",
    "Bachelor of Science (Hons) in Applied Artificial Intelligence",
    "Bachelor of Science (Hons) in Applied Computing (Fintech)",
    "Bachelor of Science (Hons) in Computer Science in Interactive Media and Game Development",
    "Bachelor of Science (Hons) in Computer Science in Real-Time Interactive Simulation",
    "Bachelor of Science (Hons) in Computing Science",
    "Bachelor of Science (Hons) in Diagnostic Radiography",
    "Bachelor of Science (Hons) in Dietetics and Nutrition",
    "Bachelor of Science (Hons) in Digital Communications and Integrated Media",
    "Bachelor of Science (Hons) in Digital Supply Chain",
    "Bachelor of Science (Hons) in Food Business Management (Baking and Pastry Arts)",
    "Bachelor of Science (Hons) in Food Business Management (Culinary Arts)",
    "Bachelor of Science (Hons) in Information and Communications Technology (Information Security)",
    "Bachelor of Science (Hons) in Information and Communications Technology (Software Engineering)",
    "Bachelor of Science (Hons) in Nursing",
    "Bachelor of Science (Hons) in Occupational Therapy",
    "Bachelor of Science (Hons) in Physiotherapy",
    "Bachelor of Science (Hons) in Radiation Therapy",
    "Bachelor of Science (Hons) in Speech and Language Therapy",
    "Bachelor of Science (Hons) in Telematics (Intelligent Transportation Systems Engineering)",
  ],
};
export const emptyEntry = (): Entry => ({ title: "", org: "", dates: "", details: [] });
export const emptyProfile: Profile = { name: "", email: "", phone: "", location: "", links: "", summary: "", skills: [], experience: [], education: [], projects: [], awards: [], sections: [], additional: [] };
export const defaultState: State = { profile: emptyProfile, provider: "gemini", geminiKey: "", openaiKey: "", qwenKey: "", anthropicKey: "", template: "standard", defaultsVersion: 2, tailored: {}, covers: {}, keywords: {}, saved: [], employmentType: "", course: "", skillsWant: [], skillsAvoid: [] };
export const profileText = (p: Profile) =>
  [p.summary, p.skills.join(" "), ...[...p.experience, ...p.education, ...p.projects, ...(p.sections || []).flatMap((s) => s.entries)].flatMap((e) => [e.title, e.org, ...e.details]), ...p.awards, ...(p.additional || [])].join("\n");
export const isDesktop = () => typeof window !== "undefined" && !!window.desktop;
declare global {
  interface Window {
    desktop?: {
      openPortal: () => Promise<void>;
      scrape: () => Promise<{ added: number; total: number }>;
      savePdf: (name: string) => Promise<boolean>;
      setCreds: (user: string, pass: string) => Promise<{ user: string }>;
      getCreds: () => Promise<{ user: string }>;
      onProgress: (cb: (p: { i: number; n: number; msg?: string }) => void) => () => void;
    };
  }
}
