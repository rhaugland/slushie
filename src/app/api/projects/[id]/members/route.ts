import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const members = await prisma.projectMember.findMany({
    where: { projectId: id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(members);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email } = await req.json();
  if (!email?.trim()) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const trimmedEmail = email.trim().toLowerCase();

  // Check if already a member or invited
  const existing = await prisma.projectMember.findFirst({
    where: {
      projectId: id,
      OR: [
        { user: { email: trimmedEmail } },
        { invitedEmail: trimmedEmail },
      ],
    },
  });
  if (existing) {
    return NextResponse.json({ error: "Already a member or invited" }, { status: 409 });
  }

  const existingUser = await prisma.user.findUnique({ where: { email: trimmedEmail } });

  const member = await prisma.projectMember.create({
    data: {
      projectId: id,
      userId: existingUser?.id || null,
      invitedEmail: existingUser ? null : trimmedEmail,
      role: "member",
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json(member, { status: 201 });
}
