import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

function generatePassword(length = 8): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars[bytes[i] % chars.length];
  }
  return password;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const email = body.email?.trim()?.toLowerCase();

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: { client: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const password = generatePassword();
  const inviteToken = randomUUID();

  // Create or find the user account for this email
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const passwordHash = await hashPassword(password);
    user = await prisma.user.create({
      data: {
        email,
        name: email.split("@")[0],
        passwordHash,
      },
    });
  } else {
    // Reset password so the invite sender can share it
    const passwordHash = await hashPassword(password);
    user = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
  }

  // Upsert the ClientMember with invite token
  let clientMember = await prisma.clientMember.findFirst({
    where: { clientId: project.clientId, userId: user.id },
  });
  if (!clientMember) {
    clientMember = await prisma.clientMember.create({
      data: {
        clientId: project.clientId,
        userId: user.id,
        invitedEmail: email,
        inviteToken,
        role: "member",
      },
    });
  } else {
    clientMember = await prisma.clientMember.update({
      where: { id: clientMember.id },
      data: { inviteToken, invitedEmail: email },
    });
  }

  // Ensure project access
  const existingAccess = await prisma.clientMemberProject.findFirst({
    where: { clientMemberId: clientMember.id, projectId: project.id },
  });
  if (!existingAccess) {
    await prisma.clientMemberProject.create({
      data: {
        clientMemberId: clientMember.id,
        projectId: project.id,
      },
    });
  }

  const origin = req.headers.get("origin") || req.nextUrl.origin;
  const inviteUrl = `${origin}/portal/login?invite=${inviteToken}&email=${encodeURIComponent(email)}`;

  return NextResponse.json({
    inviteUrl,
    email,
    password,
    projectName: project.name,
  });
}
