import { pct, shortDate, signed, temp } from "@/lib/format";
import type { DayComparison } from "@/lib/types";
import { weatherEmoji, weatherLabel } from "@/lib/weatherCodes";

function rankLabel(p: number | null): string | null {
  if (p === null) return null;
  if (p >= 90) return "かなり高い";
  if (p >= 70) return "高め";
  if (p <= 10) return "かなり低い";
  if (p <= 30) return "低め";
  return "平年並み";
}

export function ForecastTable({ comparison }: { comparison: DayComparison[] }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <h3 className="font-bold">7日間予報と平年比較</h3>
      <p className="mb-3 text-xs text-muted">
        「平年比」は過去20年の同じ時期（前後3日）の最高気温の分布の中での位置です。
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm tabular">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="py-2 pr-2 font-medium">日付</th>
              <th className="py-2 pr-2 font-medium">天気</th>
              <th className="py-2 pr-2 text-right font-medium">最高 / 最低</th>
              <th className="py-2 pr-2 text-right font-medium">平年差</th>
              <th className="py-2 pr-2 font-medium">平年比</th>
              <th className="py-2 text-right font-medium">降水確率（平年）</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map((d) => (
              <tr key={d.date} className="border-b border-line last:border-0">
                <td className="py-2 pr-2 whitespace-nowrap">{shortDate(d.date)}</td>
                <td className="py-2 pr-2 whitespace-nowrap">
                  <span aria-hidden>{weatherEmoji(d.weatherCode)}</span> {weatherLabel(d.weatherCode)}
                </td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">
                  <span className="font-semibold">{temp(d.forecastTmax)}</span>
                  <span className="text-muted"> / </span>
                  <span className="text-ink-2">{temp(d.forecastTmin)}</span>
                </td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">{signed(d.tmaxAnomaly)}</td>
                <td className="py-2 pr-2 whitespace-nowrap text-ink-2">
                  {rankLabel(d.tmaxPercentile) ?? "—"}
                  {d.tmaxPercentile !== null && (
                    <span className="text-xs text-muted">（{d.tmaxPercentile}%）</span>
                  )}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  {pct(d.forecastPrecipProbability)}
                  <span className="text-xs text-muted">（{pct(d.normalRainProbability)}）</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
