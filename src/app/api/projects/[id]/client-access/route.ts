import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: { client: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const slug = toSlug(project.name);
  const email = `client@${slug}.preview.slushie.com`;
  const password = "preview2026";

  // Upsert the user
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const passwordHash = await hashPassword(password);
    user = await prisma.user.create({
      data: {
        email,
        name: `${project.client.name} Client`,
        passwordHash,
      },
    });
  }

  // Upsert the ClientMember
  let clientMember = await prisma.clientMember.findFirst({
    where: { clientId: project.clientId, userId: user.id },
  });
  if (!clientMember) {
    clientMember = await prisma.clientMember.create({
      data: {
        clientId: project.clientId,
        userId: user.id,
        role: "member",
      },
    });
  }

  // Upsert the ClientMemberProject
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

  return NextResponse.json({ email, password });
}
