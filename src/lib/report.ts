import { dateRange } from "./dates";
import { loadDaily, locationKey, saveDaily } from "./db";
import { fetchArchive, fetchForecast, OpenMeteoError } from "./openmeteo";
import { compareForecast, computeClimateStats, historyWindows } from "./stats";
import type { DailyRecord, Place, WeatherReport } from "./types";

/** 同時実行数を制限して並列処理する（Open-Meteo のレート制限対策） */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * 過去 20 年分の「同じ時期」の日別データを用意する。
 * まず DB を見て、足りない年の窓だけを Open-Meteo Archive API から取得して DB に保存する。
 */
async function loadHistory(
  place: Place,
  locKey: string,
  targetDate: string,
  timezone: string,
): Promise<{ records: DailyRecord[]; source: WeatherReport["historySource"] }> {
  const windows = historyWindows(targetDate);
  const stored = await loadDaily(locKey, windows[0].start, windows[windows.length - 1].end);
  const have = new Set(stored.map((r) => r.date));
  const missing = windows.filter((w) => dateRange(w.start, w.end).some((d) => !have.has(d)));

  if (!missing.length) return { records: stored, source: "database" };

  const results = await mapLimit(missing, 5, (w) =>
    fetchArchive(place.lat, place.lon, w.start, w.end, timezone),
  );
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > missing.length / 2) {
    const reason = (failures[0] as PromiseRejectedResult).reason;
    throw reason instanceof Error ? reason : new OpenMeteoError(String(reason));
  }
  const fetched = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  await saveDaily(locKey, fetched);

  const byDate = new Map<string, DailyRecord>(stored.map((r) => [r.date, r]));
  for (const r of fetched) byDate.set(r.date, r);
  return {
    records: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    source: stored.length ? "mixed" : "api",
  };
}

export async function buildReport(place: Place): Promise<WeatherReport> {
  const forecast = await fetchForecast(place.lat, place.lon);
  if (!forecast.daily.length) throw new OpenMeteoError("予報データが空でした");

  // 「今日」は地点のローカル日付（予報 API の 1 日目）を使う
  const targetDate = forecast.daily[0].date;
  const locKey = locationKey(place.lat, place.lon);
  const { records, source } = await loadHistory(place, locKey, targetDate, forecast.timezone);

  return {
    place,
    locKey,
    forecast,
    stats: computeClimateStats(records, targetDate),
    comparison: compareForecast(records, targetDate, forecast.daily),
    historySource: source,
  };
}
