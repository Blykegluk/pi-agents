import { NextRequest, NextResponse } from "next/server";
import { loadApis, addAgentApi, setAgentApis } from "@/lib/apis";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agent = searchParams.get("agent");

    const allApis = loadApis();

    if (agent) {
      return NextResponse.json({ apis: allApis[agent] || [] });
    }

    return NextResponse.json(allApis);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load APIs", details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentName, api, apis } = body;

    if (!agentName) {
      return NextResponse.json(
        { error: "agentName required" },
        { status: 400 }
      );
    }

    if (apis) {
      // Replace entire API list for this agent
      setAgentApis(agentName, apis);
    } else if (api) {
      // Add single API
      addAgentApi(agentName, api);
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to save APIs", details: String(error) },
      { status: 500 }
    );
  }
}
