import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ workspaces: [] });
  }

  // Find pending client member invites
  const clientInvites = await prisma.clientMember.findMany({
    where: { invitedEmail: email, userId: null },
    include: {
      client: {
        include: {
          workspace: { select: { id: true, name: true } },
        },
      },
    },
  });

  // Find pending workspace member invites
  const wsInvites = await prisma.workspaceMember.findMany({
    where: { invitedEmail: email, userId: null },
    include: {
      workspace: { select: { id: true, name: true } },
    },
  });

  // Deduplicate workspace names
  const workspaceMap = new Map<string, string>();
  for (const ci of clientInvites) {
    workspaceMap.set(ci.client.workspace.id, ci.client.workspace.name);
  }
  for (const wi of wsInvites) {
    workspaceMap.set(wi.workspace.id, wi.workspace.name);
  }

  return NextResponse.json({
    workspaces: Array.from(workspaceMap.values()),
  });
}
