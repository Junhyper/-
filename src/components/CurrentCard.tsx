import { longDate, signed, temp } from "@/lib/format";
import type { WeatherReport } from "@/lib/types";
import { weatherEmoji, weatherLabel } from "@/lib/weatherCodes";

export function CurrentCard({ report }: { report: WeatherReport }) {
  const { place, forecast, comparison } = report;
  const c = forecast.current;
  const today = comparison[0];
  const region = [place.admin1, place.country].filter(Boolean).join(" / ");

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-2xl font-bold">
          {place.name}
          {region && <span className="ml-2 text-sm font-normal text-muted">{region}</span>}
        </h2>
        <span className="text-sm text-muted tabular">
          {longDate(today.date)} {c.time.slice(11, 16)} 現在（{forecast.timezone}）
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="flex items-center gap-3">
          <span className="text-5xl" aria-hidden>
            {weatherEmoji(c.weatherCode)}
          </span>
          <div>
            <div className="text-4xl font-bold tabular">{temp(c.temperature)}</div>
            <div className="text-sm text-ink-2">{weatherLabel(c.weatherCode)}</div>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted">体感</dt>
            <dd className="tabular">{temp(c.apparentTemperature)}</dd>
          </div>
          <div>
            <dt className="text-muted">湿度</dt>
            <dd className="tabular">{c.humidity}%</dd>
          </div>
          <div>
            <dt className="text-muted">風速</dt>
            <dd className="tabular">{(c.windSpeed / 3.6).toFixed(1)} m/s</dd>
          </div>
          <div>
            <dt className="text-muted">降水量</dt>
            <dd className="tabular">{c.precipitation} mm</dd>
          </div>
        </dl>
      </div>

      <div className="mt-4 grid gap-2 rounded-xl bg-surface-2 p-3 text-sm sm:grid-cols-2">
        <p>
          <span className="text-muted">今日の予想最高 </span>
          <strong className="tabular">{temp(today.forecastTmax)}</strong>
          <span className="text-muted"> （平年 {temp(today.normalTmax)}、</span>
          <strong className="tabular">{signed(today.tmaxAnomaly)}</strong>
          <span className="text-muted">）</span>
        </p>
        <p>
          <span className="text-muted">今日の予想最低 </span>
          <strong className="tabular">{temp(today.forecastTmin)}</strong>
          <span className="text-muted"> （平年 {temp(today.normalTmin)}）</span>
        </p>
      </div>
    </section>
  );
}
