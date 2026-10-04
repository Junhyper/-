-- アプリ起動時に自動で作成されます（手動で流す場合はこのファイルを使用）
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
