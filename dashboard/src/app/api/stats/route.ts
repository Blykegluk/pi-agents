import { NextResponse } from "next/server";
import { computeOverviewStats } from "@/lib/aggregator";
import { startScheduler } from "@/lib/scheduler";

// Start the scheduler on first API call
startScheduler();

export async function GET() {
  try {
    const stats = computeOverviewStats();
    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to compute stats", details: String(error) },
      { status: 500 }
    );
  }
}
