/**
 * Monthly pay from a salary string, for filtering and sorting across boards:
 * "$72,000 - $96,000 a year" -> 6000, "$20 an hour" -> 3460, "$2,500" (ReadyTalent allowance) -> 2500.
 * Uses the lower end of a range; 0 when no number is given.
 */
export function monthlyPay(salary: string): number {
  const s = (salary || "").toLowerCase();
  const m = s.match(/(\d[\d,]*(?:\.\d+)?)\s*(k\b)?/);
  if (!m) return 0;
  let n = Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1);
  if (/year|annum|annual|yr|p\.?a\b/.test(s)) n /= 12;
  else if (/hour|hr\b|\/h\b/.test(s)) n *= 173; // ~40 h/week
  else if (/day|daily/.test(s)) n *= 21.7;
  else if (/week|wk\b/.test(s)) n *= 4.33;
  return Math.round(n);
}

/** Pay filter choices: "" any, "shown" = has a pay figure, otherwise a monthly minimum. */
export const PAY_FILTERS: [string, string][] = [
  ["", "Any pay"], ["shown", "Shows pay"], ["1000", "≥ $1,000 / month"], ["2000", "≥ $2,000 / month"],
  ["3000", "≥ $3,000 / month"], ["5000", "≥ $5,000 / month"], ["8000", "≥ $8,000 / month"],
];

export function payPasses(salary: string, filter: string): boolean {
  if (!filter) return true;
  const pay = monthlyPay(salary);
  return filter === "shown" ? pay > 0 : pay >= Number(filter);
}
