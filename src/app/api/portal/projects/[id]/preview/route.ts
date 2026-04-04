import { NextRequest, NextResponse } from "next/server";
import { getCurrentClientUser } from "@/lib/portal-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentClientUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const hasAccess = user.clientMemberships.some((cm) =>
    cm.projectAccess.some((pa) => pa.project.id === id)
  );
  if (!hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let deployUrl: string | null = null;
  for (const cm of user.clientMemberships) {
    for (const pa of cm.projectAccess) {
      if (pa.project.id === id) {
        deployUrl = pa.project.deployUrl;
        break;
      }
    }
  }

  return NextResponse.json({ deployUrl });
}
