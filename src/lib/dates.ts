// 地点のローカル日付を "YYYY-MM-DD" 文字列のまま扱うための小さなヘルパー群。
// タイムゾーンの影響を受けないよう、内部計算はすべて UTC で行う。

export function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(s: string, days: number): string {
  const d = parseDate(s);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** 同じ月日を別の年に移す（閏日は平年なら 2/28 に寄せる）。 */
export function sameDayInYear(s: string, year: number): string {
  const [, m, d] = s.split("-").map(Number);
  const day = m === 2 && d === 29 && !isLeapYear(year) ? 28 : d;
  return `${year}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let cur = start; cur <= end; cur = addDays(cur, 1)) out.push(cur);
  return out;
}
