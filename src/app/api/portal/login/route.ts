import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      clientMemberships: { select: { id: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  // Claim any pending client member invites before checking access
  const pendingClientMembers = await prisma.clientMember.findMany({
    where: { invitedEmail: email, userId: null },
  });
  for (const cm of pendingClientMembers) {
    await prisma.clientMember.update({
      where: { id: cm.id },
      data: { userId: user.id, invitedEmail: null },
    });
  }

  // Check client access (after claiming invites so first-time users aren't locked out)
  const totalMemberships = user.clientMemberships.length + pendingClientMembers.length;
  if (totalMemberships === 0) {
    return NextResponse.json({ error: "No client access. Contact your project team for an invite." }, { status: 403 });
  }

  await setSessionCookie(user.id, user.email);

  return NextResponse.json({ ok: true });
}
