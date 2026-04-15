import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, createToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "email and password required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  // Migrate legacy "owner" role to "admin"
  await prisma.workspaceMember.updateMany({
    where: { userId: user.id, role: "owner" },
    data: { role: "admin" },
  });

  // Claim any pending client member invites on login
  const pendingClientMembers = await prisma.clientMember.findMany({
    where: { invitedEmail: email, userId: null },
    include: { client: { select: { workspaceId: true } } },
  });

  for (const cm of pendingClientMembers) {
    await prisma.clientMember.update({
      where: { id: cm.id },
      data: { userId: user.id, invitedEmail: null },
    });

    const existingWm = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: cm.client.workspaceId, userId: user.id } },
    });
    if (!existingWm) {
      await prisma.workspaceMember.create({
        data: { workspaceId: cm.client.workspaceId, userId: user.id, role: "member" },
      });
    }
  }

  const token = await createToken(user.id, user.email);
  const response = NextResponse.json({ id: user.id, name: user.name, email: user.email });
  response.cookies.set("session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
