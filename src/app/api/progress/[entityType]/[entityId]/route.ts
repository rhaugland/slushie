import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const TERMINAL_STATUSES: Record<string, string[]> = {
  meeting: ["ready", "failed"],
  objective: ["deployed", "failed"],
  build: ["live", "failed"],
};

async function getStatus(entityType: string, entityId: string) {
  switch (entityType) {
    case "meeting": {
      const m = await prisma.meeting.findUnique({ where: { id: entityId } });
      return m ? { step: m.status, status: m.status, message: `Meeting is ${m.status}` } : null;
    }
    case "objective": {
      const o = await prisma.objective.findUnique({ where: { id: entityId } });
      return o ? { step: o.status, status: o.status, message: `Objective is ${o.status}` } : null;
    }
    case "build": {
      const b = await prisma.build.findUnique({ where: { id: entityId } });
      return b
        ? { step: b.deployStatus, status: b.deployStatus, message: `Build is ${b.deployStatus}` }
        : null;
    }
    default:
      return null;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ entityType: string; entityId: string }> }
) {
  const { entityType, entityId } = await params;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const terminals = TERMINAL_STATUSES[entityType] || [];
      let lastStatus = "";

      const interval = setInterval(async () => {
        try {
          const status = await getStatus(entityType, entityId);
          if (!status) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "not found" })}\n\n`));
            clearInterval(interval);
            controller.close();
            return;
          }

          if (status.status !== lastStatus) {
            lastStatus = status.status;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(status)}\n\n`));
          }

          if (terminals.includes(status.status)) {
            clearInterval(interval);
            controller.close();
          }
        } catch {
          clearInterval(interval);
          controller.close();
        }
      }, 1000);
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
