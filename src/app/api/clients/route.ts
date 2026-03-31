import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const clients = await prisma.client.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      meetings: {
        include: {
          objectives: {
            include: { builds: true },
          },
        },
      },
    },
  });
  return NextResponse.json(clients);
}

export async function POST(req: NextRequest) {
  const { name, firm } = await req.json();
  if (!name || !firm || !["w3", "isotropic"].includes(firm)) {
    return NextResponse.json({ error: "name and firm (w3|isotropic) required" }, { status: 400 });
  }
  const client = await prisma.client.create({ data: { name, firm } });
  return NextResponse.json(client, { status: 201 });
}
