import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

const DUMMY_ENTRIES = [
  // Builds
  { action: "build_started", category: "build", description: 'Build started for "Session-based route guard"', userName: "Ryan", hoursAgo: 1 },
  { action: "build_completed", category: "build", description: 'Build completed for "Session-based route guard"', userName: "Claude Code", hoursAgo: 0.8 },
  { action: "build_started", category: "build", description: 'Build started for "File upload with drag-and-drop"', userName: "Ryan", hoursAgo: 3 },
  { action: "build_failed", category: "build", description: 'Build failed for "File upload with drag-and-drop"', userName: "Claude Code", hoursAgo: 2.8 },
  { action: "build_started", category: "build", description: 'Build started for "Logout action"', userName: "Ryan Haugland", hoursAgo: 26 },
  { action: "build_completed", category: "build", description: 'Build completed for "Logout action"', userName: "Claude Code", hoursAgo: 25.5 },
  // Features
  { action: "feature_created", category: "feature", description: 'Feature "Real-time notifications" created', userName: "Ryan", hoursAgo: 2 },
  { action: "feature_created", category: "feature", description: 'Feature "User profile page" created', userName: "Ryan Haugland", hoursAgo: 5 },
  { action: "feature_toggled_on", category: "feature", description: '"Session-based route guard" toggled on', userName: "Ryan", hoursAgo: 0.5 },
  { action: "feature_toggled_off", category: "feature", description: '"File upload with drag-and-drop" toggled off', userName: "Ryan", hoursAgo: 4 },
  { action: "feature_deleted", category: "feature", description: 'Feature "Legacy dashboard" deleted', userName: "Ryan Haugland", hoursAgo: 50 },
  // Variants
  { action: "variant_created", category: "variant", description: 'Variant created for "Session-based route guard"', userName: "Ryan", hoursAgo: 6 },
  { action: "variant_promoted", category: "variant", description: 'Variant promoted for "Logout action"', userName: "Ryan Haugland", hoursAgo: 28 },
  { action: "variant_deleted", category: "variant", description: 'Variant deleted for "File list with delete"', userName: "Ryan", hoursAgo: 48 },
  // Team
  { action: "member_added", category: "team", description: "Added Sarah Chen to Ottera", userName: "Ryan", hoursAgo: 7 },
  { action: "member_invited", category: "team", description: "Invited alex@ottera.com to Ottera", userName: "Ryan Haugland", hoursAgo: 24 },
  { action: "role_changed", category: "team", description: "Role changed to admin for Sarah Chen", userName: "Ryan", hoursAgo: 8 },
  // More builds from days ago
  { action: "build_started", category: "build", description: 'Build started for "Archive / unarchive room button"', userName: "Ryan", hoursAgo: 72 },
  { action: "build_completed", category: "build", description: 'Build completed for "Archive / unarchive room button"', userName: "Claude Code", hoursAgo: 71.5 },
  { action: "feature_created", category: "feature", description: 'Feature "Archive / unarchive room button" created', userName: "Ryan Haugland", hoursAgo: 73 },
];

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = req.nextUrl;
  const action = url.searchParams.get("action");

  const workspaceIds = user.memberships.map((m: any) => m.workspaceId);
  const workspaceId = workspaceIds[0];
  if (!workspaceId) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  if (action === "clear") {
    const deleted = await prisma.activityLog.deleteMany({
      where: { workspaceId: { in: workspaceIds }, description: { startsWith: "" } },
    });
    return NextResponse.json({ deleted: deleted.count });
  }

  if (action === "clear-dummy") {
    const deleted = await prisma.activityLog.deleteMany({
      where: {
        workspaceId: { in: workspaceIds },
        metadata: { path: ["isDummy"], equals: true },
      },
    });
    return NextResponse.json({ deleted: deleted.count });
  }

  // Seed dummy data
  const now = Date.now();
  const entries = DUMMY_ENTRIES.map((e) => ({
    workspaceId,
    projectId: "cmngmkbnf0000x4s9ub80lu1f",
    userId: null as string | null,
    userName: e.userName,
    action: e.action,
    category: e.category,
    description: e.description,
    metadata: { isDummy: true },
    createdAt: new Date(now - e.hoursAgo * 3600000),
  }));

  await prisma.activityLog.createMany({ data: entries });

  return NextResponse.json({ seeded: entries.length });
}
