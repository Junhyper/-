# 20年統計 × AI 天気予報

過去20年分の気象データから、指定した地域の「この時期らしさ」を統計的に算出します。現在の天気・7日間予報と比べたうえで、生成AI（Anthropic Claude）が分かりやすい解説文を作成する Web アプリです。

- 本物のデータを使用: [Open-Meteo](https://open-meteo.com/) の Historical Weather API（ERA5 再解析）・Forecast API・Geocoding API（API キー不要）
- 統計: 対象日の前後7日 × 過去20年（300日分）から、平年値・雨の日の割合・大雨の割合・記録値・気温トレンド（℃/10年）を算出します。予報の各日は「前後3日 × 20年」の分布と比べ、平年差とパーセンタイルを出します。
- AI 解説: 統計と現在の状況・予報を Claude に渡し、解説文をストリーミング表示します。
- グラフ: 今週の予報 vs 平年値（10〜90% 帯付き）、年別の平均気温とトレンド、年別の降水量
- DB: 取得した過去データと生成済みの解説文を PostgreSQL に保存します。同じ地点の2回目以降は Open-Meteo を呼ばず、同じ日の解説文は60分間再利用します。

## 技術スタック

| レイヤー | 採用技術 |
|---|---|
| フロント / API | Next.js 16（App Router, Route Handlers）+ TypeScript + Tailwind CSS v4 |
| グラフ | Recharts |
| LLM | Anthropic Claude（`@anthropic-ai/sdk`、既定モデル `claude-opus-5-5`） |
| DB | PostgreSQL（Vercel Marketplace の Neon を想定 / `postgres` ドライバ） |
| ホスティング | Vercel |

```
ブラウザ ─ /api/geocode ──────▶ Open-Meteo Geocoding
        └ /api/forecast (NDJSON ストリーム)
             1. Forecast API（現在の天気 + 7日間予報）
             2. 過去20年の同じ時期: DB → 足りない年だけ Archive API → DB に保存
             3. 統計処理（src/lib/stats.ts）→ グラフ用データを先に送信
             4. Claude で解説文をストリーミング生成 → DB に保存
```

## ローカルで動かす

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY を設定（DATABASE_URL は任意）
npm run dev                  # http://localhost:3000
```

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー |
| `npm run build` | 本番ビルド |
| `npm test` | 統計ロジックの単体テスト（Vitest） |
| `npm run lint` | ESLint |

DB のテーブルは初回アクセス時に自動で作成されます（定義は `db/schema.sql`）。

## Vercel へのデプロイ

### 方法 A: ダッシュボードから（推奨・約5分）

1. このブランチを `main` にマージする（または手順 2 のあとで Vercel の Settings → Git → Production Branch をこのブランチに変更する）。
2. https://vercel.com/new で GitHub リポジトリ `junhyper/-` を Import する。
   - Project Name は `ai-weather-stats` など英数字の名前にする（リポジトリ名の `-` はそのままでは使えません）。
   - Framework Preset は Next.js が自動で選ばれます。ビルド設定の変更は不要です。
3. Environment Variables に `ANTHROPIC_API_KEY` を追加する（https://console.anthropic.com/ で発行）。
4. Deploy を押す。この時点で DB なしの状態で動きます。
5. DB を追加する: プロジェクトの **Storage** タブ → **Create Database** → **Neon**（Serverless Postgres）→ Free プランで作成し、このプロジェクトに Connect する。`DATABASE_URL` が自動で設定されます。
6. **Deployments** → 最新のデプロイの「…」→ **Redeploy**。環境変数は再デプロイ後に反映されます。

発行された `https://<project>.vercel.app` をブラウザで開けば利用できます。

### 方法 B: CLI から

```bash
npm i -g vercel
vercel login
vercel link                                   # プロジェクトを作成・紐付け
vercel env add ANTHROPIC_API_KEY production   # キーを入力
# DB: ダッシュボードの Storage → Neon を作成して Connect（DATABASE_URL が自動設定される）
vercel --prod
```

## 環境変数

| 名前 | 必須 | 説明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | ○ | 未設定でも統計とグラフは表示され、AI 解説だけが非表示になります |
| `DATABASE_URL`（または `POSTGRES_URL`） | – | 未設定なら DB なしで動作します（Next.js の fetch キャッシュのみ） |
| `ANTHROPIC_MODEL` | – | 既定は `claude-opus-5-5` |
| `ANTHROPIC_EFFORT` | – | `low`（既定）/ `medium` / `high` など |

## 注意事項

- Open-Meteo の無料 API は**非商用利用**が条件で、1日 10,000 回などの制限があります。新しい地点では、過去データの取得にリクエストが約20回かかります（2回目以降は DB から読みます）。商用で使う場合は Open-Meteo の有料プランを検討してください。
- 気象データは CC BY 4.0 です。画面下部にクレジットを表示しています。
- 過去データは ERA5 再解析（約 25km 格子）のため、観測所の値とは多少異なります。
