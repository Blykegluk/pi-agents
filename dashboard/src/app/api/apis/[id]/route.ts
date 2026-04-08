import { NextRequest, NextResponse } from "next/server";
import { updateAgentApi, deleteAgentApi } from "@/lib/apis";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { agentName, updates } = body;

    if (!agentName) {
      return NextResponse.json(
        { error: "agentName required" },
        { status: 400 }
      );
    }

    const result = updateAgentApi(agentName, id, updates);
    if (!result) {
      return NextResponse.json({ error: "API not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update API", details: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const agentName = searchParams.get("agent");

    if (!agentName) {
      return NextResponse.json(
        { error: "agent query param required" },
        { status: 400 }
      );
    }

    const deleted = deleteAgentApi(agentName, id);
    if (!deleted) {
      return NextResponse.json({ error: "API not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete API", details: String(error) },
      { status: 500 }
    );
  }
}
