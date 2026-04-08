import { NextRequest, NextResponse } from "next/server";
import { getRun } from "@/lib/runner";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const run = getRun(id);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    return NextResponse.json(run);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to get run", details: String(error) },
      { status: 500 }
    );
  }
}
