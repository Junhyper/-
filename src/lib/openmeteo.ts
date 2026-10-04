import type { DailyRecord, Forecast, Place } from "./types";

// Open-Meteo（https://open-meteo.com/）は非商用利用なら API キー不要・無料。
// データは CC BY 4.0 のため、画面にクレジットを表示している。
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

const DAY = 60 * 60 * 24;

export class OpenMeteoError extends Error {}

async function getJson<T>(url: string, revalidate: number): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      next: { revalidate },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new OpenMeteoError(`Open-Meteo への接続に失敗しました: ${(e as Error).message}`);
  }
  const body = (await res.json().catch(() => null)) as (T & { reason?: string }) | null;
  if (!res.ok || !body) {
    throw new OpenMeteoError(
      `Open-Meteo がエラーを返しました (HTTP ${res.status})${body?.reason ? `: ${body.reason}` : ""}`,
    );
  }
  return body;
}

interface GeocodingResponse {
  results?: {
    name: string;
    latitude: number;
    longitude: number;
    country?: string;
    admin1?: string;
  }[];
}

export async function searchPlaces(query: string): Promise<Place[]> {
  const params = new URLSearchParams({ name: query, count: "8", language: "ja", format: "json" });
  const data = await getJson<GeocodingResponse>(`${GEOCODING_URL}?${params}`, DAY);
  return (data.results ?? []).map((r) => ({
    name: r.name,
    lat: r.latitude,
    lon: r.longitude,
    country: r.country,
    admin1: r.admin1,
  }));
}

interface ForecastResponse {
  timezone: string;
  current: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    precipitation: number;
    weather_code: number;
    cloud_cover: number;
    wind_speed_10m: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    precipitation_probability_max: (number | null)[];
  };
}

export async function fetchForecast(lat: number, lon: number): Promise<Forecast> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current:
      "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "7",
  });
  // 現在の天気は 10 分間キャッシュ
  const d = await getJson<ForecastResponse>(`${FORECAST_URL}?${params}`, 600);
  return {
    timezone: d.timezone,
    current: {
      time: d.current.time,
      temperature: d.current.temperature_2m,
      apparentTemperature: d.current.apparent_temperature,
      humidity: d.current.relative_humidity_2m,
      precipitation: d.current.precipitation,
      weatherCode: d.current.weather_code,
      cloudCover: d.current.cloud_cover,
      windSpeed: d.current.wind_speed_10m,
    },
    daily: d.daily.time.map((date, i) => ({
      date,
      weatherCode: d.daily.weather_code[i],
      tmax: d.daily.temperature_2m_max[i],
      tmin: d.daily.temperature_2m_min[i],
      precip: d.daily.precipitation_sum[i],
      precipProbability: d.daily.precipitation_probability_max[i] ?? null,
    })),
  };
}

interface ArchiveResponse {
  daily?: {
    time: string[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    temperature_2m_mean: (number | null)[];
    precipitation_sum: (number | null)[];
  };
}

/** 過去データ（ERA5 再解析）を日単位で取得する。過去の値は変わらないので長期キャッシュ。 */
export async function fetchArchive(
  lat: number,
  lon: number,
  start: string,
  end: string,
  timezone: string,
): Promise<DailyRecord[]> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    start_date: start,
    end_date: end,
    daily: "temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum",
    timezone,
  });
  const d = await getJson<ArchiveResponse>(`${ARCHIVE_URL}?${params}`, 30 * DAY);
  const daily = d.daily;
  if (!daily) return [];
  return daily.time.map((date, i) => ({
    date,
    tmax: daily.temperature_2m_max[i],
    tmin: daily.temperature_2m_min[i],
    tmean: daily.temperature_2m_mean[i],
    precip: daily.precipitation_sum[i],
  }));
}
