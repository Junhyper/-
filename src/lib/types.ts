export interface Place {
  name: string;
  lat: number;
  lon: number;
  country?: string;
  admin1?: string;
}

/** 1日分の観測（再解析）データ。欠測は null。 */
export interface DailyRecord {
  date: string; // YYYY-MM-DD（地点のローカル日付）
  tmax: number | null;
  tmin: number | null;
  tmean: number | null;
  precip: number | null;
}

export interface CurrentWeather {
  time: string;
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  precipitation: number;
  weatherCode: number;
  cloudCover: number;
  windSpeed: number;
}

export interface ForecastDay {
  date: string;
  weatherCode: number;
  tmax: number;
  tmin: number;
  precip: number;
  precipProbability: number | null;
}

export interface Forecast {
  timezone: string;
  current: CurrentWeather;
  daily: ForecastDay[];
}

export interface YearlyStat {
  year: number;
  tmean: number | null;
  tmax: number | null;
  tmin: number | null;
  precipTotal: number | null;
  rainyDays: number;
}

export interface Extreme {
  value: number;
  date: string;
}

export interface DayComparison {
  date: string;
  normalTmax: number | null;
  normalTmin: number | null;
  /** 過去20年の同時期の最高気温の10〜90パーセンタイル帯 */
  tmaxP10: number | null;
  tmaxP90: number | null;
  normalRainProbability: number | null;
  forecastTmax: number;
  forecastTmin: number;
  forecastPrecip: number;
  forecastPrecipProbability: number | null;
  weatherCode: number;
  tmaxAnomaly: number | null;
  /** 予報最高気温が過去20年の同時期の中で何パーセンタイルに当たるか */
  tmaxPercentile: number | null;
}

export interface ClimateStats {
  targetDate: string;
  windowDays: number; // 対象日の前後何日を集計したか
  startYear: number;
  endYear: number;
  sampleDays: number;
  normalTmax: number | null;
  normalTmin: number | null;
  normalTmean: number | null;
  tmaxStdDev: number | null;
  rainProbability: number | null; // 日降水量 1mm 以上の日の割合 (%)
  heavyRainProbability: number | null; // 日降水量 10mm 以上の日の割合 (%)
  avgPrecipPerDay: number | null;
  recordHigh: Extreme | null;
  recordLow: Extreme | null;
  maxDailyPrecip: Extreme | null;
  trendPerDecade: number | null; // 年平均気温（期間平均）の線形トレンド ℃/10年
  firstHalfMean: number | null;
  secondHalfMean: number | null;
  yearly: YearlyStat[];
}

export interface WeatherReport {
  place: Place;
  locKey: string;
  forecast: Forecast;
  stats: ClimateStats;
  comparison: DayComparison[];
  historySource: "database" | "api" | "mixed";
}

/** /api/forecast が返す NDJSON の各行 */
export type StreamEvent =
  | { type: "report"; data: WeatherReport }
  | { type: "delta"; text: string }
  | { type: "done"; cached: boolean; model: string | null }
  | { type: "commentary_unavailable"; reason: string }
  | { type: "error"; message: string };
