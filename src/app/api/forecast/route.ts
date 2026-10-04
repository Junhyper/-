import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { findRecentReport, saveReport } from "@/lib/db";
import { CommentaryRefusedError, isLlmConfigured, MODEL, streamCommentary } from "@/lib/llm";
import { OpenMeteoError } from "@/lib/openmeteo";
import { buildReport } from "@/lib/report";
import type { Place, StreamEvent } from "@/lib/types";

// 初回の地点は過去データ取得 + LLM 生成で数十秒かかることがある
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** 同じ地点・同じ日の解説文はこの時間内なら DB から再利用する */
const COMMENTARY_REUSE_MINUTES = 60;

function parsePlace(params: URLSearchParams): Place | null {
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  const name = (params.get("name") ?? "").trim().slice(0, 80);
  if (!params.get("lat") || !params.get("lon")) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const opt = (k: string) => params.get(k)?.trim().slice(0, 80) || undefined;
  return {
    name: name || `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
    lat,
    lon,
    admin1: opt("admin1"),
    country: opt("country"),
  };
}

function llmErrorMessage(e: unknown): string {
  if (e instanceof CommentaryRefusedError) return e.message;
  if (e instanceof Anthropic.AuthenticationError) return "Anthropic API キーが無効です。サーバーの設定を確認してください。";
  if (e instanceof Anthropic.RateLimitError) return "AI が混み合っています。少し時間をおいて再度お試しください。";
  if (e instanceof Anthropic.APIError) return `AI 解説の生成に失敗しました (${e.status ?? "network"})。`;
  return "AI 解説の生成に失敗しました。";
}

export async function GET(req: NextRequest) {
  const place = parsePlace(req.nextUrl.searchParams);
  if (!place) {
    return NextResponse.json({ error: "lat / lon を正しく指定してください。" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true;
        }
      };

      try {
        // 1) 統計データ（過去 20 年 + 現在の天気 + 予報）を先に返してグラフを描画させる
        let report;
        try {
          report = await buildReport(place);
        } catch (e) {
          console.error("[forecast] report", e);
          send({
            type: "error",
            message:
              e instanceof OpenMeteoError ? e.message : "気象データの取得・集計に失敗しました。",
          });
          return;
        }
        send({ type: "report", data: report });

        // 2) AI 解説文（直近に生成済みなら DB から再利用）
        const targetDate = report.stats.targetDate;
        const cached = await findRecentReport(report.locKey, targetDate, COMMENTARY_REUSE_MINUTES);
        if (cached) {
          send({ type: "delta", text: cached.commentary });
          send({ type: "done", cached: true, model: cached.model });
          return;
        }
        if (!isLlmConfigured()) {
          send({
            type: "commentary_unavailable",
            reason: "ANTHROPIC_API_KEY が設定されていないため、AI 解説は表示できません。",
          });
          return;
        }

        let text = "";
        try {
          for await (const chunk of streamCommentary(report)) {
            if (closed) return;
            text += chunk;
            send({ type: "delta", text: chunk });
          }
        } catch (e) {
          console.error("[forecast] llm", e);
          send({ type: "error", message: llmErrorMessage(e) });
          return;
        }

        if (text.trim()) {
          await saveReport({
            locKey: report.locKey,
            placeName: place.name,
            lat: place.lat,
            lon: place.lon,
            targetDate,
            model: MODEL,
            commentary: text,
          });
        }
        send({ type: "done", cached: false, model: MODEL });
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
