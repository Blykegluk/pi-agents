import { NextRequest, NextResponse } from "next/server";
import { loadWorkflows, createWorkflow } from "@/lib/workflows";

export async function GET() {
  try {
    const workflows = loadWorkflows();
    return NextResponse.json({ workflows });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load workflows", details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const workflow = createWorkflow(body);
    return NextResponse.json(workflow, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create workflow", details: String(error) },
      { status: 500 }
    );
  }
}
