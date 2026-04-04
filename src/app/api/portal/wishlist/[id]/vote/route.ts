import { NextRequest, NextResponse } from "next/server";
import { getCurrentClientUser } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentClientUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: wishlistItemId } = await params;
  const { vote } = await req.json();

  if (vote !== 1 && vote !== -1 && vote !== 0) {
    return NextResponse.json({ error: "vote must be 1, -1, or 0" }, { status: 400 });
  }

  const wishlistItem = await prisma.wishlistItem.findUnique({
    where: { id: wishlistItemId },
    select: { projectId: true },
  });

  if (!wishlistItem || !wishlistItem.projectId) {
    return NextResponse.json({ error: "Wishlist item not found" }, { status: 404 });
  }

  let clientMemberId: string | null = null;
  for (const cm of user.clientMemberships) {
    if (cm.projectAccess.some((pa) => pa.project.id === wishlistItem.projectId)) {
      clientMemberId = cm.id;
      break;
    }
  }

  if (!clientMemberId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  if (vote === 0) {
    await prisma.wishlistVote.deleteMany({
      where: { wishlistItemId, clientMemberId },
    });
  } else {
    await prisma.wishlistVote.upsert({
      where: { wishlistItemId_clientMemberId: { wishlistItemId, clientMemberId } },
      update: { vote },
      create: { wishlistItemId, clientMemberId, vote },
    });
  }

  const votes = await prisma.wishlistVote.findMany({
    where: { wishlistItemId },
    select: { vote: true, clientMemberId: true },
  });

  const voteCount = votes.reduce((sum, v) => sum + v.vote, 0);
  const clientVote = votes.find((v) => v.clientMemberId === clientMemberId)?.vote ?? null;

  return NextResponse.json({ voteCount, clientVote });
}
