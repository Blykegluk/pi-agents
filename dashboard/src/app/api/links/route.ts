import { NextRequest, NextResponse } from "next/server";
import { loadLinks, addLink } from "@/lib/links";

export async function GET() {
  try {
    const links = loadLinks();
    return NextResponse.json({ links });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to load links", details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const link = addLink(body);
    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create link", details: String(error) },
      { status: 500 }
    );
  }
}
