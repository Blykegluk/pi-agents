import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";
import { getWorkflow } from "@/lib/workflows";

const PROMPTS_DIR = path.join(os.homedir(), ".pi", "agent", "prompts");

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const workflow = getWorkflow(id);
    if (!workflow) {
      return NextResponse.json(
        { error: "Pipeline not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { content, format } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "No content provided" },
        { status: 400 }
      );
    }

    // Ensure prompts directory exists
    if (!fs.existsSync(PROMPTS_DIR)) {
      fs.mkdirSync(PROMPTS_DIR, { recursive: true });
    }

    // Write prompt file
    const fileName = `workflow-${id}.md`;
    const filePath = path.join(PROMPTS_DIR, fileName);
    fs.writeFileSync(filePath, content, "utf-8");

    return NextResponse.json({
      success: true,
      path: filePath,
      fileName,
      format,
      size: Buffer.byteLength(content, "utf-8"),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to publish pipeline", details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const fileName = `workflow-${id}.md`;
  const filePath = path.join(PROMPTS_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json(
      { published: false },
      { status: 200 }
    );
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const stats = fs.statSync(filePath);

  return NextResponse.json({
    published: true,
    path: filePath,
    fileName,
    content,
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
  });
}
