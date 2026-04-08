import { NextRequest } from "next/server";
import { getWorkflow } from "@/lib/workflows";
import { runWorkflow, stopAgent } from "@/lib/runner";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  // Handle stop
  if (body.action === "stop" && body.runId) {
    const stopped = stopAgent(body.runId);
    return new Response(JSON.stringify({ stopped }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const workflow = getWorkflow(id);
  if (!workflow) {
    return new Response(JSON.stringify({ error: "Workflow not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const task = body.task || `Execute the workflow: ${workflow.name}`;

  const encoder = new TextEncoder();
  let streamClosed = false;
  const stream = new ReadableStream({
    start(controller) {
      const safeSend = (msg: string) => {
        if (streamClosed) return;
        try { controller.enqueue(encoder.encode(msg)); } catch { streamClosed = true; }
      };
      const safeClose = () => {
        if (streamClosed) return;
        streamClosed = true;
        try { controller.close(); } catch { /* already closed */ }
      };

      let runId = "";
      runId = runWorkflow({
        workflow,
        task,
        cwd: body.cwd,
        onData: (data) => {
          safeSend(`data: ${JSON.stringify({ type: "output", data, runId })}\n\n`);
        },
        onDone: (exitCode) => {
          safeSend(`data: ${JSON.stringify({ type: "done", exitCode, runId })}\n\n`);
          safeClose();
        },
        onError: (error) => {
          safeSend(`data: ${JSON.stringify({ type: "error", error, runId })}\n\n`);
          safeClose();
        },
      });

      safeSend(`data: ${JSON.stringify({ type: "started", runId })}\n\n`);
    },
    cancel() {
      streamClosed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
