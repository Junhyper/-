import { NextResponse, type NextRequest } from "next/server";
import { searchPlaces } from "@/lib/openmeteo";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 1 || q.length > 80) {
    return NextResponse.json({ places: [] });
  }
  try {
    return NextResponse.json({ places: await searchPlaces(q) });
  } catch (e) {
    console.error("[geocode]", e);
    return NextResponse.json({ error: "地名の検索に失敗しました。" }, { status: 502 });
  }
}
