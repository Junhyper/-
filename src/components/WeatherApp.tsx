"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Place, StreamEvent, WeatherReport } from "@/lib/types";
import { WeekChart, YearlyPrecipChart, YearlyTempChart } from "./Charts";
import { Commentary, type CommentaryStatus } from "./Commentary";
import { CurrentCard } from "./CurrentCard";
import { ForecastTable } from "./ForecastTable";
import { SearchBox } from "./SearchBox";
import { StatTiles } from "./StatTiles";

interface RecentPlace {
  name: string;
  lat: number;
  lon: number;
}

const SUGGESTIONS: Place[] = [
  { name: "東京", lat: 35.6895, lon: 139.6917, admin1: "東京都", country: "日本" },
  { name: "大阪", lat: 34.6937, lon: 135.5022, admin1: "大阪府", country: "日本" },
  { name: "札幌", lat: 43.0642, lon: 141.3469, admin1: "北海道", country: "日本" },
  { name: "那覇", lat: 26.2125, lon: 127.6811, admin1: "沖縄県", country: "日本" },
];

function placeToQuery(p: Place): string {
  const q = new URLSearchParams({ lat: p.lat.toFixed(4), lon: p.lon.toFixed(4), name: p.name });
  if (p.admin1) q.set("admin1", p.admin1);
  if (p.country) q.set("country", p.country);
  return q.toString();
}

function placeFromQuery(search: string): Place | null {
  const q = new URLSearchParams(search);
  const lat = Number(q.get("lat"));
  const lon = Number(q.get("lon"));
  if (!q.get("lat") || !q.get("lon") || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    name: q.get("name") || "指定地点",
    lat,
    lon,
    admin1: q.get("admin1") ?? undefined,
    country: q.get("country") ?? undefined,
  };
}

export function WeatherApp() {
  const [report, setReport] = useState<WeatherReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<CommentaryStatus>("idle");
  const [commentaryMessage, setCommentaryMessage] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentPlace[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const loadRecent = useCallback(async () => {
    try {
      const res = await fetch("/api/recent");
      const data = (await res.json()) as { places: RecentPlace[] };
      setRecent(data.places ?? []);
    } catch {
      /* 履歴は無くても動作に影響しない */
    }
  }, []);

  const run = useCallback(
    async (place: Place) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      window.history.replaceState(null, "", `?${placeToQuery(place)}`);
      setLoading(true);
      setError(null);
      setReport(null);
      setText("");
      setStatus("idle");
      setCommentaryMessage(null);
      setMeta(null);

      let gotReport = false;
      const handle = (ev: StreamEvent) => {
        switch (ev.type) {
          case "report":
            gotReport = true;
            setReport(ev.data);
            setLoading(false);
            setStatus("streaming");
            break;
          case "delta":
            setText((t) => t + ev.text);
            break;
          case "done":
            setStatus("done");
            setMeta(ev.cached ? "直近の生成結果を再利用" : null);
            break;
          case "commentary_unavailable":
            setStatus("unavailable");
            setCommentaryMessage(ev.reason);
            break;
          case "error":
            if (gotReport) {
              setStatus("error");
              setCommentaryMessage(ev.message);
            } else {
              setError(ev.message);
            }
            break;
        }
      };

      try {
        const res = await fetch(`/api/forecast?${placeToQuery(place)}`, { signal: ctrl.signal });
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `サーバーエラー (HTTP ${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) if (line.trim()) handle(JSON.parse(line) as StreamEvent);
        }
        if (buf.trim()) handle(JSON.parse(buf) as StreamEvent);
        // 解説が途中で途切れた場合もカーソルを止める
        setStatus((s) => (s === "streaming" ? "done" : s));
        loadRecent();
      } catch (e) {
        if (ctrl.signal.aborted) return;
        const message = e instanceof Error ? e.message : "通信に失敗しました";
        if (gotReport) {
          setStatus("error");
          setCommentaryMessage(message);
        } else {
          setError(message);
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    },
    [loadRecent],
  );

  // 初回表示: URL に地点があればそれを、なければ履歴を読み込む
  useEffect(() => {
    const initial = placeFromQuery(window.location.search);
    const t = setTimeout(() => {
      if (initial) run(initial);
      loadRecent();
    }, 0);
    return () => clearTimeout(t);
  }, [run, loadRecent]);

  const quickPlaces: Place[] = recent.length ? recent.map((r) => ({ ...r })) : SUGGESTIONS;

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">20年統計 × AI 天気予報</h1>
        <p className="mt-1 text-sm text-ink-2">
          過去20年分の実測ベースの気象データから「この時期らしさ」を算出し、今の天気・予報と比べて AI が解説します。
        </p>
      </header>

      <SearchBox onSelect={run} />

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">{recent.length ? "最近の検索:" : "例:"}</span>
        {quickPlaces.map((p) => (
          <button
            key={`${p.lat},${p.lon}`}
            onClick={() => run(p)}
            className="rounded-full border border-line bg-surface px-3 py-1 text-ink-2 hover:bg-surface-2"
          >
            {p.name}
          </button>
        ))}
      </div>

      <main className="mt-6 space-y-5">
        {error && (
          <div role="alert" className="rounded-2xl border border-danger/40 bg-surface p-4 text-sm text-danger">
            {error}
          </div>
        )}

        {loading && !report && (
          <div className="rounded-2xl border border-line bg-surface p-6 text-sm text-ink-2">
            <div className="mb-3 h-2 w-full overflow-hidden rounded bg-surface-2">
              <div className="h-full w-1/3 animate-pulse rounded bg-cool/60" />
            </div>
            過去20年分の気象データを取得・集計しています…（初めての地点は10〜20秒ほどかかります）
          </div>
        )}

        {report && (
          <>
            <CurrentCard report={report} />
            <Commentary text={text} status={status} message={commentaryMessage} meta={meta} />
            <StatTiles stats={report.stats} />
            <WeekChart comparison={report.comparison} />
            <ForecastTable comparison={report.comparison} />
            <div className="grid gap-5 lg:grid-cols-2">
              <YearlyTempChart stats={report.stats} />
              <YearlyPrecipChart stats={report.stats} />
            </div>
            <p className="text-xs text-muted">
              過去データの取得元: {report.historySource === "database" ? "データベース（キャッシュ）" : report.historySource === "mixed" ? "データベース + Open-Meteo" : "Open-Meteo Historical Weather API"}
            </p>
          </>
        )}

        {!report && !loading && !error && (
          <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
            地域名を入力するか、上の地点を選んでください。
          </div>
        )}
      </main>

      <footer className="mt-10 border-t border-line pt-4 text-xs text-muted">
        気象データ:{" "}
        <a className="underline" href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo.com
        </a>{" "}
        （ERA5 再解析 / CC BY 4.0）・ 解説文: Anthropic Claude
      </footer>
    </div>
  );
}
