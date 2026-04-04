import { NextResponse } from "next/server";
import { getCurrentClientUser } from "@/lib/portal-auth";

export async function GET() {
  const user = await getCurrentClientUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projects = user.clientMemberships.flatMap((cm) =>
    cm.projectAccess.map((pa) => ({
      id: pa.project.id,
      name: pa.project.name,
      clientName: cm.client.name,
      deployUrl: pa.project.deployUrl,
    }))
  );

  return NextResponse.json({ projects });
}
