import { NextResponse } from "next/server";
import { computeToolStats } from "@/lib/aggregator";

export async function GET() {
  try {
    const tools = computeToolStats();
    return NextResponse.json({ tools });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to compute tool stats", details: String(error) },
      { status: 500 }
    );
  }
}
