import { NextResponse } from "next/server";
import { computeCostBreakdown } from "@/lib/aggregator";

export async function GET() {
  try {
    const breakdown = computeCostBreakdown();
    return NextResponse.json(breakdown);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to compute costs", details: String(error) },
      { status: 500 }
    );
  }
}
