"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { shortDate } from "@/lib/format";
import type { ClimateStats, DayComparison } from "@/lib/types";

// globals.css のトークンと同じ値（SVG 属性には CSS 変数を渡さず、確定値を使う）
const PALETTE = {
  light: {
    warm: "#eb6834",
    cool: "#2a78d6",
    aqua: "#1baf7a",
    band: "rgba(235,104,52,0.16)",
    grid: "#e9e9e5",
    axis: "#7d7c77",
    ink2: "#52514e",
    surface: "#ffffff",
    line: "#e3e5e9",
  },
  dark: {
    warm: "#d95926",
    cool: "#3987e5",
    aqua: "#199e70",
    band: "rgba(217,89,38,0.24)",
    grid: "#2c2c2a",
    axis: "#8f8e86",
    ink2: "#c3c2b7",
    surface: "#1a1a19",
    line: "#2f2f2c",
  },
};

function subscribe(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function useColors() {
  const dark = useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
  return dark ? PALETTE.dark : PALETTE.light;
}

function ChartCard({ title, caption, children }: { title: string; caption: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <h3 className="font-bold">{title}</h3>
      <p className="mb-3 text-xs text-muted">{caption}</p>
      <div className="h-72 w-full">{children}</div>
    </section>
  );
}

function useCommonProps() {
  const c = useColors();
  return {
    c,
    grid: <CartesianGrid stroke={c.grid} vertical={false} />,
    tick: { fill: c.axis, fontSize: 12 },
    tooltip: {
      contentStyle: {
        background: c.surface,
        border: `1px solid ${c.line}`,
        borderRadius: 12,
        fontSize: 13,
      },
      labelStyle: { color: c.ink2, fontWeight: 600 },
    },
    // 凡例の文字は系列色ではなくテキスト色で描く（色はマーカーが担う）
    legend: {
      wrapperStyle: { fontSize: 12 },
      formatter: (value: string) => <span style={{ color: c.ink2 }}>{value}</span>,
    },
  };
}

const fmtTemp = (v: unknown) =>
  Array.isArray(v)
    ? `${Number(v[0]).toFixed(1)}〜${Number(v[1]).toFixed(1)}℃`
    : typeof v === "number"
      ? `${v.toFixed(1)}℃`
      : "—";

/** 今週の予報と、過去20年の同じ時期の平年値・ばらつきの比較 */
export function WeekChart({ comparison }: { comparison: DayComparison[] }) {
  const { c, grid, tick, tooltip, legend } = useCommonProps();
  const data = comparison.map((d) => ({
    label: shortDate(d.date),
    band: d.tmaxP10 !== null && d.tmaxP90 !== null ? [d.tmaxP10, d.tmaxP90] : null,
    normalTmax: d.normalTmax,
    normalTmin: d.normalTmin,
    forecastTmax: d.forecastTmax,
    forecastTmin: d.forecastTmin,
  }));
  return (
    <ChartCard
      title="今週の予報 vs 過去20年の平年値"
      caption="実線が予報、破線が平年値（各日の前後3日×20年の平均）。帯は過去20年の最高気温の10〜90%の範囲。"
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {grid}
          <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: c.grid }} />
          <YAxis tick={tick} tickLine={false} axisLine={false} unit="℃" width={52} domain={["auto", "auto"]} />
          <Tooltip {...tooltip} formatter={(v) => fmtTemp(v)} />
          <Legend {...legend} />
          <Area
            dataKey="band"
            name="最高気温の平年幅(10〜90%)"
            fill={c.band}
            stroke="none"
            isAnimationActive={false}
            activeDot={false}
          />
          <Line
            dataKey="normalTmax"
            name="平年の最高"
            stroke={c.warm}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
          />
          <Line
            dataKey="normalTmin"
            name="平年の最低"
            stroke={c.cool}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
          />
          <Line
            dataKey="forecastTmax"
            name="予報の最高"
            stroke={c.warm}
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, fill: c.surface }}
          />
          <Line
            dataKey="forecastTmin"
            name="予報の最低"
            stroke={c.cool}
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, fill: c.surface }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** 年ごとの「この時期の平均気温」と線形トレンド */
export function YearlyTempChart({ stats }: { stats: ClimateStats }) {
  const { c, grid, tick, tooltip, legend } = useCommonProps();
  const pts = stats.yearly.filter((y) => y.tmean !== null);
  // 統計値と同じ最小二乗直線を描画用に再計算
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p.year, 0) / (n || 1);
  const my = pts.reduce((a, p) => a + (p.tmean as number), 0) / (n || 1);
  const den = pts.reduce((a, p) => a + (p.year - mx) ** 2, 0);
  const slope = den ? pts.reduce((a, p) => a + (p.year - mx) * ((p.tmean as number) - my), 0) / den : 0;
  const data = stats.yearly.map((y) => ({
    year: y.year,
    tmean: y.tmean,
    trend: n >= 3 ? Math.round((my + slope * (y.year - mx)) * 10) / 10 : null,
  }));
  return (
    <ChartCard
      title="この時期の平均気温の推移（20年）"
      caption={`各年の同じ時期（前後${stats.windowDays}日）の平均気温と、その長期トレンド（${
        stats.trendPerDecade === null ? "—" : `${stats.trendPerDecade > 0 ? "+" : ""}${stats.trendPerDecade}℃/10年`
      }）。`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {grid}
          <XAxis dataKey="year" tick={tick} tickLine={false} axisLine={{ stroke: c.grid }} minTickGap={16} />
          <YAxis tick={tick} tickLine={false} axisLine={false} unit="℃" width={52} domain={["auto", "auto"]} />
          <Tooltip {...tooltip} formatter={(v) => fmtTemp(v)} labelFormatter={(l) => `${l}年`} />
          <Legend {...legend} />
          <Line
            dataKey="tmean"
            name="平均気温"
            stroke={c.warm}
            strokeWidth={2}
            dot={{ r: 4, strokeWidth: 2, fill: c.surface }}
            connectNulls
          />
          <Line dataKey="trend" name="トレンド" stroke={c.cool} strokeWidth={2} strokeDasharray="6 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** 年ごとの「この時期の降水量合計」 */
export function YearlyPrecipChart({ stats }: { stats: ClimateStats }) {
  const { c, grid, tick, tooltip } = useCommonProps();
  const values = stats.yearly.map((y) => y.precipTotal).filter((v): v is number => v !== null);
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  return (
    <ChartCard
      title="この時期の降水量（年別）"
      caption={`各年の同じ時期（${stats.windowDays * 2 + 1}日間）の降水量合計。破線は20年平均${
        avg === null ? "" : `（${avg.toFixed(1)}mm）`
      }。`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={stats.yearly} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {grid}
          <XAxis dataKey="year" tick={tick} tickLine={false} axisLine={{ stroke: c.grid }} minTickGap={16} />
          <YAxis tick={tick} tickLine={false} axisLine={false} unit="mm" width={56} />
          <Tooltip
            {...tooltip}
            cursor={{ fill: c.grid, opacity: 0.5 }}
            labelFormatter={(l) => `${l}年`}
            formatter={(v, _name, item) => [
              `${Number(v).toFixed(1)}mm（雨の日 ${(item.payload as { rainyDays: number }).rainyDays}日）`,
              "降水量",
            ]}
          />
          {avg !== null && <ReferenceLine y={avg} stroke={c.axis} strokeDasharray="5 4" />}
          <Bar dataKey="precipTotal" name="降水量" fill={c.cool} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
