import { addDays, sameDayInYear } from "./dates";
import type {
  ClimateStats,
  DailyRecord,
  DayComparison,
  Extreme,
  ForecastDay,
  YearlyStat,
} from "./types";

export const YEARS = 20;
/** 統計の集計窓: 対象日の前後 7 日（計 15 日 × 20 年 = 300 日分） */
export const WINDOW_DAYS = 7;
/** 予報日ごとの平年値は前後 3 日で平滑化する */
export const SMOOTHING_DAYS = 3;
/** 予報 7 日分 + 平滑化に必要な、各年の取得範囲（対象日からのオフセット） */
export const FETCH_OFFSET_START = -WINDOW_DAYS;
export const FETCH_OFFSET_END = 6 + SMOOTHING_DAYS;

const RAIN_MM = 1;
const HEAVY_RAIN_MM = 10;

export function yearRange(targetDate: string): { startYear: number; endYear: number } {
  const endYear = Number(targetDate.slice(0, 4)) - 1;
  return { startYear: endYear - YEARS + 1, endYear };
}

/** 各年について取得が必要な日付範囲（対象日と同じ月日を中心とした窓） */
export function historyWindows(targetDate: string): { year: number; start: string; end: string }[] {
  const { startYear, endYear } = yearRange(targetDate);
  const out = [];
  for (let year = startYear; year <= endYear; year++) {
    const center = sameDayInYear(targetDate, year);
    out.push({
      year,
      start: addDays(center, FETCH_OFFSET_START),
      end: addDays(center, FETCH_OFFSET_END),
    });
  }
  return out;
}

const round1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function stdDev(xs: number[]): number | null {
  const m = mean(xs);
  if (m === null || xs.length < 2) return null;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/** 線形補間によるパーセンタイル（p は 0〜100） */
export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const idx = (p / 100) * (s.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

/** 最小二乗法の傾き */
export function linearSlope(points: { x: number; y: number }[]): number | null {
  if (points.length < 3) return null;
  const mx = mean(points.map((p) => p.x))!;
  const my = mean(points.map((p) => p.y))!;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  return den === 0 ? null : num / den;
}

function dayMean(r: DailyRecord): number | null {
  if (r.tmean !== null) return r.tmean;
  if (r.tmax !== null && r.tmin !== null) return (r.tmax + r.tmin) / 2;
  return null;
}

const nums = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null && Number.isFinite(x));

function extreme(
  records: DailyRecord[],
  pick: (r: DailyRecord) => number | null,
  better: (a: number, b: number) => boolean,
): Extreme | null {
  let best: Extreme | null = null;
  for (const r of records) {
    const v = pick(r);
    if (v === null) continue;
    if (!best || better(v, best.value)) best = { value: v, date: r.date };
  }
  return best && { value: round1(best.value)!, date: best.date };
}

/** 中心日 ± radius 日のレコードを、全対象年について集める */
function collect(
  byDate: Map<string, DailyRecord>,
  targetDate: string,
  offset: number,
  radius: number,
): DailyRecord[] {
  const { startYear, endYear } = yearRange(targetDate);
  const out: DailyRecord[] = [];
  for (let year = startYear; year <= endYear; year++) {
    const center = addDays(sameDayInYear(targetDate, year), offset);
    for (let k = -radius; k <= radius; k++) {
      const r = byDate.get(addDays(center, k));
      if (r) out.push(r);
    }
  }
  return out;
}

export function computeClimateStats(records: DailyRecord[], targetDate: string): ClimateStats {
  const byDate = new Map(records.map((r) => [r.date, r]));
  const { startYear, endYear } = yearRange(targetDate);

  const yearly: YearlyStat[] = [];
  for (let year = startYear; year <= endYear; year++) {
    const center = sameDayInYear(targetDate, year);
    const rs: DailyRecord[] = [];
    for (let k = -WINDOW_DAYS; k <= WINDOW_DAYS; k++) {
      const r = byDate.get(addDays(center, k));
      if (r) rs.push(r);
    }
    const precips = nums(rs.map((r) => r.precip));
    yearly.push({
      year,
      tmean: round1(mean(nums(rs.map(dayMean)))),
      tmax: round1(mean(nums(rs.map((r) => r.tmax)))),
      tmin: round1(mean(nums(rs.map((r) => r.tmin)))),
      precipTotal: precips.length ? round1(precips.reduce((a, b) => a + b, 0)) : null,
      rainyDays: precips.filter((p) => p >= RAIN_MM).length,
    });
  }

  const all = collect(byDate, targetDate, 0, WINDOW_DAYS);
  const tmaxs = nums(all.map((r) => r.tmax));
  const tmins = nums(all.map((r) => r.tmin));
  const precips = nums(all.map((r) => r.precip));
  const pct = (n: number) => (precips.length ? round1((n / precips.length) * 100) : null);

  const trendPoints = yearly
    .filter((y) => y.tmean !== null)
    .map((y) => ({ x: y.year, y: y.tmean as number }));
  const slope = linearSlope(trendPoints);
  const half = Math.floor(yearly.length / 2);

  return {
    targetDate,
    windowDays: WINDOW_DAYS,
    startYear,
    endYear,
    sampleDays: all.length,
    normalTmax: round1(mean(tmaxs)),
    normalTmin: round1(mean(tmins)),
    normalTmean: round1(mean(nums(all.map(dayMean)))),
    tmaxStdDev: round1(stdDev(tmaxs)),
    rainProbability: pct(precips.filter((p) => p >= RAIN_MM).length),
    heavyRainProbability: pct(precips.filter((p) => p >= HEAVY_RAIN_MM).length),
    avgPrecipPerDay: round1(mean(precips)),
    recordHigh: extreme(all, (r) => r.tmax, (a, b) => a > b),
    recordLow: extreme(all, (r) => r.tmin, (a, b) => a < b),
    maxDailyPrecip: extreme(all, (r) => r.precip, (a, b) => a > b),
    trendPerDecade: slope === null ? null : Math.round(slope * 100) / 10,
    firstHalfMean: round1(mean(nums(yearly.slice(0, half).map((y) => y.tmean)))),
    secondHalfMean: round1(mean(nums(yearly.slice(half).map((y) => y.tmean)))),
    yearly,
  };
}

/** 7 日間予報の各日を、過去 20 年の同じ時期（前後 3 日）と比較する */
export function compareForecast(
  records: DailyRecord[],
  targetDate: string,
  forecast: ForecastDay[],
): DayComparison[] {
  const byDate = new Map(records.map((r) => [r.date, r]));
  return forecast.map((f, offset) => {
    const rs = collect(byDate, targetDate, offset, SMOOTHING_DAYS);
    const tmaxs = nums(rs.map((r) => r.tmax));
    const tmins = nums(rs.map((r) => r.tmin));
    const precips = nums(rs.map((r) => r.precip));
    const normalTmax = round1(mean(tmaxs));
    return {
      date: f.date,
      normalTmax,
      normalTmin: round1(mean(tmins)),
      tmaxP10: round1(percentile(tmaxs, 10)),
      tmaxP90: round1(percentile(tmaxs, 90)),
      normalRainProbability: precips.length
        ? round1((precips.filter((p) => p >= RAIN_MM).length / precips.length) * 100)
        : null,
      forecastTmax: f.tmax,
      forecastTmin: f.tmin,
      forecastPrecip: f.precip,
      forecastPrecipProbability: f.precipProbability,
      weatherCode: f.weatherCode,
      tmaxAnomaly: normalTmax === null ? null : round1(f.tmax - normalTmax),
      tmaxPercentile: tmaxs.length
        ? Math.round((tmaxs.filter((t) => t <= f.tmax).length / tmaxs.length) * 100)
        : null,
    };
  });
}
