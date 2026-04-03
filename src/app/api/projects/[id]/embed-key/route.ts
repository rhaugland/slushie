import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, apiKey: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Generate API key if none exists
  if (!project.apiKey) {
    const apiKey = crypto.randomBytes(16).toString("hex");
    project = await prisma.project.update({
      where: { id },
      data: { apiKey },
      select: { id: true, apiKey: true },
    });
  }

  const host = req.headers.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const embedCode = `<script src="${protocol}://${host}/feedback.js?key=${project.apiKey}"></script>`;

  return NextResponse.json({
    apiKey: project.apiKey,
    embedCode,
  });
}
