import { NextRequest } from "next/server";
import { runAgent, stopAgent } from "@/lib/runner";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { agent, task, cwd, action, runId } = body;

  // Handle stop action
  if (action === "stop" && runId) {
    const stopped = stopAgent(runId);
    return new Response(JSON.stringify({ stopped }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!agent || !task) {
    return new Response(JSON.stringify({ error: "agent and task required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // SSE streaming response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const id = runAgent({
        agent,
        task,
        cwd,
        onData: (data) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "output", data, runId: id })}\n\n`)
          );
        },
        onDone: (exitCode) => {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done", exitCode, runId: id })}\n\n`
            )
          );
          controller.close();
        },
        onError: (error) => {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", error, runId: id })}\n\n`
            )
          );
          controller.close();
        },
      });

      // Send initial event with runId
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "started", runId: id })}\n\n`
        )
      );
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
