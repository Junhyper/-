import { parseDate } from "./dates";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** "2026-10-04" → "10/4(土)" */
export function shortDate(s: string): string {
  const d = parseDate(s);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WEEKDAYS[d.getUTCDay()]})`;
}

/** "2026-10-04" → "2026年10月4日" */
export function longDate(s: string): string {
  const d = parseDate(s);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

export function temp(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${v.toFixed(1)}℃`;
}

export function signed(v: number | null | undefined, unit = "℃"): string {
  if (v === null || v === undefined) return "—";
  const s = v > 0 ? "+" : v < 0 ? "−" : "±";
  return `${s}${Math.abs(v).toFixed(1)}${unit}`;
}

export function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${Math.round(v)}%`;
}
