import { describe, expect, it } from "vitest";
import { addDays, dateRange, sameDayInYear } from "./dates";
import {
  compareForecast,
  computeClimateStats,
  historyWindows,
  linearSlope,
  percentile,
} from "./stats";
import type { DailyRecord, ForecastDay } from "./types";

/** year ごとに一定の気温上昇（0.03℃/年）と、5 日に 1 回 5mm の雨を持つ合成データ */
function synthetic(targetDate: string): DailyRecord[] {
  const out: DailyRecord[] = [];
  for (const w of historyWindows(targetDate)) {
    for (const date of dateRange(w.start, w.end)) {
      const warming = (w.year - 2006) * 0.03;
      const day = Number(date.slice(8, 10));
      out.push({
        date,
        tmax: 25 + warming,
        tmin: 15 + warming,
        tmean: 20 + warming,
        precip: day % 5 === 0 ? 5 : 0,
      });
    }
  }
  return out;
}

describe("dates", () => {
  it("handles leap days and month boundaries", () => {
    expect(sameDayInYear("2024-02-29", 2023)).toBe("2023-02-28");
    expect(sameDayInYear("2024-02-29", 2020)).toBe("2020-02-29");
    expect(addDays("2025-12-28", 7)).toBe("2026-01-04");
    expect(dateRange("2024-02-27", "2024-03-01")).toEqual([
      "2024-02-27",
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
    ]);
  });
});

describe("historyWindows", () => {
  it("covers the 20 previous years around the same calendar day", () => {
    const ws = historyWindows("2026-10-04");
    expect(ws).toHaveLength(20);
    expect(ws[0]).toEqual({ year: 2006, start: "2006-09-27", end: "2006-10-13" });
    expect(ws[19]).toEqual({ year: 2025, start: "2025-09-27", end: "2025-10-13" });
  });

  it("crosses the year boundary for early-January targets", () => {
    const ws = historyWindows("2026-01-02");
    expect(ws[0].start).toBe("2005-12-26");
    expect(ws[0].end).toBe("2006-01-11");
  });
});

describe("helpers", () => {
  it("percentile interpolates", () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(percentile([0, 10], 10)).toBeCloseTo(1);
    expect(percentile([], 50)).toBeNull();
  });

  it("linearSlope fits a line", () => {
    expect(linearSlope([1, 2, 3, 4].map((x) => ({ x, y: 2 * x + 1 })))).toBeCloseTo(2);
  });
});

describe("computeClimateStats", () => {
  const target = "2026-10-04";
  const stats = computeClimateStats(synthetic(target), target);

  it("aggregates 15 days x 20 years", () => {
    expect(stats.startYear).toBe(2006);
    expect(stats.endYear).toBe(2025);
    expect(stats.sampleDays).toBe(300);
    expect(stats.yearly).toHaveLength(20);
  });

  it("computes normals, rain probability and trend", () => {
    // 平均の上昇分 = 0.03 * 9.5 = 0.285
    expect(stats.normalTmax).toBeCloseTo(25.3, 1);
    expect(stats.normalTmin).toBeCloseTo(15.3, 1);
    // 9/27〜10/11 のうち 5 の倍数の日: 9/30, 10/5, 10/10 → 3/15 = 20%
    expect(stats.rainProbability).toBe(20);
    expect(stats.heavyRainProbability).toBe(0);
    expect(stats.trendPerDecade).toBeCloseTo(0.3, 5);
    expect(stats.recordHigh?.date.startsWith("2025")).toBe(true);
    expect(stats.recordLow?.date.startsWith("2006")).toBe(true);
    expect(stats.yearly[0].rainyDays).toBe(3);
    expect(stats.yearly[0].precipTotal).toBe(15);
  });

  it("tolerates missing data", () => {
    const empty = computeClimateStats([], target);
    expect(empty.sampleDays).toBe(0);
    expect(empty.normalTmax).toBeNull();
    expect(empty.trendPerDecade).toBeNull();
    expect(empty.yearly.every((y) => y.tmean === null)).toBe(true);
  });
});

describe("compareForecast", () => {
  it("compares each forecast day against the same period", () => {
    const target = "2026-10-04";
    const forecast: ForecastDay[] = dateRange(target, addDays(target, 6)).map((date, i) => ({
      date,
      weatherCode: 1,
      tmax: 25 + i,
      tmin: 15,
      precip: 0,
      precipProbability: 10,
    }));
    const cmp = compareForecast(synthetic(target), target, forecast);
    expect(cmp).toHaveLength(7);
    expect(cmp[0].normalTmax).toBeCloseTo(25.3, 1);
    expect(cmp[0].tmaxAnomaly).toBeCloseTo(-0.3, 1);
    // 予報 31℃ は過去のすべての値より高い
    expect(cmp[6].tmaxPercentile).toBe(100);
    expect(cmp[6].tmaxP10).not.toBeNull();
  });
});
