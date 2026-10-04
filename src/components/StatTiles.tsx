import { pct, shortDate, signed, temp } from "@/lib/format";
import type { ClimateStats } from "@/lib/types";

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-lg font-bold tabular sm:text-2xl">{value}</div>
      {note && <div className="mt-1 text-xs text-ink-2">{note}</div>}
    </div>
  );
}

const yearOf = (d: string) => d.slice(0, 4);

export function StatTiles({ stats }: { stats: ClimateStats }) {
  const s = stats;
  return (
    <section>
      <h2 className="mb-1 text-lg font-bold">過去20年の同じ時期の統計</h2>
      <p className="mb-3 text-sm text-muted">
        {s.startYear}〜{s.endYear}年の {shortDate(s.targetDate).replace(/\(.\)/, "")} 前後{s.windowDays}日（計
        {s.sampleDays}日分）を集計
      </p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="平年の最高 / 最低気温" value={`${temp(s.normalTmax)} / ${temp(s.normalTmin)}`} />
        <Tile
          label="雨の日の割合（1mm以上）"
          value={pct(s.rainProbability)}
          note={`10mm以上の大雨は ${pct(s.heavyRainProbability)}`}
        />
        <Tile
          label="気温の長期傾向"
          value={`${signed(s.trendPerDecade)}/10年`}
          note={`前半10年 ${temp(s.firstHalfMean)} → 後半10年 ${temp(s.secondHalfMean)}`}
        />
        <Tile
          label="この時期の記録"
          value={`${temp(s.recordHigh?.value)} / ${temp(s.recordLow?.value)}`}
          note={
            s.recordHigh && s.recordLow
              ? `最高 ${yearOf(s.recordHigh.date)}年・最低 ${yearOf(s.recordLow.date)}年`
              : undefined
          }
        />
      </div>
    </section>
  );
}
