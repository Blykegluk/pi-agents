import { NextRequest, NextResponse } from "next/server";
import { getAllRuns, getRunsForAgent } from "@/lib/runner";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agent = searchParams.get("agent");

    const runs = agent ? getRunsForAgent(agent) : getAllRuns();
    return NextResponse.json({ runs });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get runs", details: String(error) },
      { status: 500 }
    );
  }
}
