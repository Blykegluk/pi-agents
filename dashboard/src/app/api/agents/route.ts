import { NextRequest, NextResponse } from "next/server";
import { listAgents, createAgent } from "@/lib/agents";

export async function GET() {
  try {
    const agents = listAgents();
    return NextResponse.json({ agents });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to list agents", details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const agent = createAgent(body);
    return NextResponse.json(agent, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create agent", details: String(error) },
      { status: 500 }
    );
  }
}
