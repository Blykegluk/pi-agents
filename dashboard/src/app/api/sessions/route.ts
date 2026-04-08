import { NextRequest, NextResponse } from "next/server";
import { getAllSessionSummaries } from "@/lib/sessions";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");
    const workspace = searchParams.get("workspace");

    let summaries = getAllSessionSummaries();

    if (workspace) {
      summaries = summaries.filter((s) => s.workspace === workspace);
    }

    const total = summaries.length;
    const paginated = summaries.slice(offset, offset + limit);

    return NextResponse.json({ sessions: paginated, total });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to list sessions", details: String(error) },
      { status: 500 }
    );
  }
}
