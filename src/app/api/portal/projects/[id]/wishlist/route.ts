import { NextRequest, NextResponse } from "next/server";
import { getCurrentClientUser } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentClientUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const hasAccess = user.clientMemberships.some((cm) =>
    cm.projectAccess.some((pa) => pa.project.id === id)
  );
  if (!hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let clientMemberId: string | null = null;
  for (const cm of user.clientMemberships) {
    if (cm.projectAccess.some((pa) => pa.project.id === id)) {
      clientMemberId = cm.id;
      break;
    }
  }

  const items = await prisma.wishlistItem.findMany({
    where: { projectId: id },
    include: {
      votes: {
        select: { vote: true, clientMemberId: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = items.map((item) => {
    const voteCount = item.votes.reduce((sum, v) => sum + v.vote, 0);
    const clientVote = item.votes.find((v) => v.clientMemberId === clientMemberId)?.vote ?? null;
    return {
      id: item.id,
      title: item.title,
      description: item.description,
      priority: item.priority,
      status: item.status,
      voteCount,
      clientVote,
    };
  });

  result.sort((a, b) => b.voteCount - a.voteCount);

  return NextResponse.json({ items: result });
}
