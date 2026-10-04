import postgres from "postgres";
import type { DailyRecord } from "./types";

// Vercel の Neon 連携は DATABASE_URL（と POSTGRES_URL）を自動設定する。
// 未設定でもアプリは動く（毎回 Open-Meteo から取得するだけ）。
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

type Sql = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as { sql?: Sql; schemaReady?: Promise<void> };

function client(): Sql | null {
  if (!DATABASE_URL) return null;
  // prepare: false は PgBouncer などのコネクションプーラ経由でも動かすため
  globalForDb.sql ??= postgres(DATABASE_URL, { max: 3, idle_timeout: 20, prepare: false });
  return globalForDb.sql;
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS daily_weather (
  loc_key TEXT NOT NULL,
  date DATE NOT NULL,
  tmax REAL,
  tmin REAL,
  tmean REAL,
  precip REAL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (loc_key, date)
);

CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  loc_key TEXT NOT NULL,
  place_name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,
  target_date DATE NOT NULL,
  model TEXT NOT NULL,
  commentary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_loc_created_idx ON reports (loc_key, created_at DESC);
CREATE INDEX IF NOT EXISTS reports_created_idx ON reports (created_at DESC);
`;

/** DB が使える状態なら SQL クライアントを返す（初回にスキーマを作成）。失敗時は null。 */
async function ready(): Promise<Sql | null> {
  const sql = client();
  if (!sql) return null;
  globalForDb.schemaReady ??= sql.unsafe(SCHEMA).then(() => undefined);
  try {
    await globalForDb.schemaReady;
    return sql;
  } catch (e) {
    globalForDb.schemaReady = undefined;
    console.error("[db] schema setup failed:", e);
    return null;
  }
}

export function isDatabaseConfigured(): boolean {
  return Boolean(DATABASE_URL);
}

/** 地点キー: 緯度経度を小数第2位（約1km）で丸める。ERA5 の格子は約 25km なので十分。 */
export function locationKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

/** 失敗しても本処理を止めないためのラッパー */
async function safely<T>(label: string, fallback: T, fn: (sql: Sql) => Promise<T>): Promise<T> {
  try {
    const sql = await ready();
    if (!sql) return fallback;
    return await fn(sql);
  } catch (e) {
    console.error(`[db] ${label} failed:`, e);
    return fallback;
  }
}

export function loadDaily(locKey: string, start: string, end: string): Promise<DailyRecord[]> {
  return safely("loadDaily", [], async (sql) => {
    const rows = await sql<
      { date: string; tmax: number | null; tmin: number | null; tmean: number | null; precip: number | null }[]
    >`
      SELECT date::text AS date, tmax, tmin, tmean, precip
      FROM daily_weather
      WHERE loc_key = ${locKey} AND date BETWEEN ${start} AND ${end}
      ORDER BY date`;
    return rows.map((r) => ({ ...r }));
  });
}

export function saveDaily(locKey: string, records: DailyRecord[]): Promise<void> {
  return safely("saveDaily", undefined, async (sql) => {
    if (!records.length) return;
    const rows = records.map((r) => ({
      loc_key: locKey,
      date: r.date,
      tmax: r.tmax,
      tmin: r.tmin,
      tmean: r.tmean,
      precip: r.precip,
    }));
    for (let i = 0; i < rows.length; i += 1000) {
      const chunk = rows.slice(i, i + 1000);
      await sql`
        INSERT INTO daily_weather ${sql(chunk, "loc_key", "date", "tmax", "tmin", "tmean", "precip")}
        ON CONFLICT (loc_key, date) DO UPDATE SET
          tmax = EXCLUDED.tmax, tmin = EXCLUDED.tmin, tmean = EXCLUDED.tmean,
          precip = EXCLUDED.precip, fetched_at = now()`;
    }
  });
}

export interface StoredReport {
  commentary: string;
  model: string;
  createdAt: string;
}

/** 同じ地点・同じ対象日について、maxAgeMinutes 以内に生成済みの解説があれば返す */
export function findRecentReport(
  locKey: string,
  targetDate: string,
  maxAgeMinutes: number,
): Promise<StoredReport | null> {
  return safely("findRecentReport", null, async (sql) => {
    const rows = await sql<{ commentary: string; model: string; created_at: Date }[]>`
      SELECT commentary, model, created_at FROM reports
      WHERE loc_key = ${locKey} AND target_date = ${targetDate}
        AND created_at > now() - make_interval(mins => ${maxAgeMinutes})
      ORDER BY created_at DESC LIMIT 1`;
    const r = rows[0];
    return r ? { commentary: r.commentary, model: r.model, createdAt: r.created_at.toISOString() } : null;
  });
}

export function saveReport(params: {
  locKey: string;
  placeName: string;
  lat: number;
  lon: number;
  targetDate: string;
  model: string;
  commentary: string;
}): Promise<void> {
  return safely("saveReport", undefined, async (sql) => {
    await sql`
      INSERT INTO reports (loc_key, place_name, lat, lon, target_date, model, commentary)
      VALUES (${params.locKey}, ${params.placeName}, ${params.lat}, ${params.lon},
              ${params.targetDate}, ${params.model}, ${params.commentary})`;
  });
}

export interface RecentPlace {
  name: string;
  lat: number;
  lon: number;
  lastSearchedAt: string;
}

export function recentPlaces(limit = 8): Promise<RecentPlace[]> {
  return safely("recentPlaces", [], async (sql) => {
    const rows = await sql<{ place_name: string; lat: number; lon: number; created_at: Date }[]>`
      SELECT * FROM (
        SELECT DISTINCT ON (loc_key) place_name, lat, lon, created_at
        FROM reports ORDER BY loc_key, created_at DESC
      ) t ORDER BY created_at DESC LIMIT ${limit}`;
    return rows.map((r) => ({
      name: r.place_name,
      lat: r.lat,
      lon: r.lon,
      lastSearchedAt: r.created_at.toISOString(),
    }));
  });
}
