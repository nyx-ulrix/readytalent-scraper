/**
 * How many entries a resume shows. Tailoring picks the most relevant ones for the job (most relevant
 * first); the base resume shows the first ones in your list. Applied both when tailoring and when drawing
 * the page, so no resume can show more.
 */
export const MAX_PROJECTS = 3;
export const MAX_LEADERSHIP = 2;

/** "Leadership & Co-Curricular Activities", "Leadership", "CCA"... */
export const isLeadership = (title: string) => /leadership|co-?curricular|\bccas?\b/i.test(title || "");

/** Entry limit for a custom section (Infinity = no limit). */
export const sectionLimit = (title: string) => (isLeadership(title) ? MAX_LEADERSHIP : Infinity);
