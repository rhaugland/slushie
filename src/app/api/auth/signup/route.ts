import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { name, email, password } = await req.json();

  if (!name || !email || !password) {
    return NextResponse.json({ error: "name, email, password required" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { name, email, passwordHash },
  });

  // Claim pending workspace invites
  await prisma.workspaceMember.updateMany({
    where: { invitedEmail: email, userId: null },
    data: { userId: user.id, invitedEmail: null },
  });

  // Claim pending client member invites
  const pendingClientMembers = await prisma.clientMember.findMany({
    where: { invitedEmail: email, userId: null },
    include: { client: { select: { workspaceId: true } } },
  });

  for (const cm of pendingClientMembers) {
    await prisma.clientMember.update({
      where: { id: cm.id },
      data: { userId: user.id, invitedEmail: null },
    });

    // Auto-create WorkspaceMember if not already one
    const existingWm = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: cm.client.workspaceId, userId: user.id } },
    });
    if (!existingWm) {
      await prisma.workspaceMember.create({
        data: { workspaceId: cm.client.workspaceId, userId: user.id, role: "member" },
      });
    }
  }

  await setSessionCookie(user.id, user.email);

  return NextResponse.json({ id: user.id, name: user.name, email: user.email }, { status: 201 });
}
