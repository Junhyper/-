import { NextResponse } from "next/server";
import { isDatabaseConfigured, recentPlaces } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    databaseEnabled: isDatabaseConfigured(),
    places: await recentPlaces(),
  });
}
