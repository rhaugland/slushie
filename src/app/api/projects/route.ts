import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Workspace owners/admins see all projects in their workspaces
  const ownerWorkspaceIds = user.memberships
    .filter((m) => m.role === "OWNER" || m.role === "ADMIN")
    .map((m) => m.workspaceId);

  // Other users see only projects granted via clientMemberships
  const grantedProjectIds = user.clientMemberships.flatMap((cm) =>
    cm.projectAccess.map((pa) => pa.projectId)
  );

  const projects = await prisma.project.findMany({
    where: {
      OR: [
        { workspaceId: { in: ownerWorkspaceIds } },
        { id: { in: grantedProjectIds } },
      ],
    },
    include: {
      client: { select: { id: true, name: true } },
      features: {
        include: { children: true, builds: { take: 1, orderBy: { createdAt: "desc" } } },
        where: { parentId: null },
        orderBy: { sortOrder: "asc" },
      },
      meetings: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, clientId } = body;

  if (!name || !clientId) {
    return NextResponse.json({ error: "name, clientId required" }, { status: 400 });
  }

  // Look up client to get its workspaceId
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Verify user is a workspace member
  const membership = user.memberships.find((m) => m.workspaceId === client.workspaceId);
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
  }

  const project = await prisma.project.create({
    data: { name, clientId, workspaceId: client.workspaceId },
  });

  const { inngest } = await import("@/inngest/client");
  await inngest.send({ name: "project/create", data: { projectId: project.id } });

  // Seed demo data into new project
  const now = Date.now();

  const noteData = [
    { text: "Client wants the dashboard to load in under 2 seconds. Current P95 is around 4.5s. Need to look at the waterfall — too many sequential API calls on mount.", by: "Ryan Haugland", hoursAgo: 2 },
    { text: "Sarah mentioned they're switching from Stripe to a custom billing system in Q3. We should keep the payment integration loosely coupled.", by: "Sarah Chen", hoursAgo: 8 },
    { text: "The onboarding flow has a 40% drop-off at the team invite step. Hypothesis: requiring 3 team members is too aggressive. Let's test with optional invites.", by: "Ryan Haugland", hoursAgo: 18 },
    { text: "API rate limits are hitting harder than expected. The batch import endpoint needs to queue jobs instead of processing inline.", by: "Alex Rivera", hoursAgo: 26 },
    { text: "Accessibility audit flagged 12 critical issues — mostly missing ARIA labels on interactive elements and poor color contrast on the secondary buttons.", by: "Sarah Chen", hoursAgo: 48 },
    { text: "Client demo went well. They loved the real-time preview but asked about white-labeling the header. Adding to the feature backlog.", by: "Ryan Haugland", hoursAgo: 72 },
  ];

  await prisma.meeting.createMany({
    data: noteData.map((n) => ({
      projectId: project.id,
      clientId,
      type: "text_note",
      textContent: n.text,
      summary: n.text.substring(0, 80) + "...",
      source: "internal",
      status: "ready",
      createdByName: n.by,
      createdById: n.by === "Ryan Haugland" ? user.id : null,
      createdAt: new Date(now - n.hoursAgo * 3600000),
    })),
  });

  const feedbackData = [
    { text: "The search is way too slow when we have more than 500 contacts.", title: "Search performance degrades with large datasets", priority: "high", source: "client", status: "pending", hoursAgo: 3 },
    { text: "Love the new dashboard layout! The chart animations are really smooth.", title: "Positive feedback on dashboard redesign", priority: "low", source: "client", status: "reviewed", hoursAgo: 12 },
    { text: "Can we get CSV export on the analytics page?", title: "CSV export for analytics data", priority: "medium", source: "client", status: "pending", hoursAgo: 24 },
    { text: "The mobile view is completely broken on the settings page.", title: "Settings page not responsive on mobile", priority: "high", source: "client", status: "pending", hoursAgo: 36 },
    { text: "File uploads keep timing out for anything over 10MB.", title: "File upload timeout for large files", priority: "high", source: "internal", status: "reviewed", hoursAgo: 72 },
    { text: "The notification system sends too many emails. Need batching.", title: "Notification batching/digest mode", priority: "medium", source: "internal", status: "pending", hoursAgo: 96 },
    { text: "When I archive a project it still shows up in search results.", title: "Archived projects appear in search", priority: "medium", source: "client", status: "pending", hoursAgo: 168 },
  ];

  await prisma.feedbackItem.createMany({
    data: feedbackData.map((f) => ({
      projectId: project.id,
      text: f.text,
      title: f.title,
      description: f.text,
      priority: f.priority,
      source: f.source,
      status: f.status,
      createdAt: new Date(now - f.hoursAgo * 3600000),
    })),
  });

  const wishlistData = [
    { title: "Role-based access control", description: "Different permission levels: admin, editor, viewer.", priority: "high", source: "meeting", hoursAgo: 5 },
    { title: "Audit trail / activity log", description: "Track who changed what and when. Important for compliance.", priority: "high", source: "feedback", hoursAgo: 12 },
    { title: "Bulk import from Salesforce", description: "One-click sync of contacts and deals from Salesforce CRM.", priority: "medium", source: "client", hoursAgo: 24 },
    { title: "Custom report builder", description: "Drag-and-drop interface to create custom reports.", priority: "medium", source: "meeting", hoursAgo: 48 },
    { title: "Two-factor authentication", description: "SMS or TOTP-based 2FA for enhanced account security.", priority: "high", source: "client", hoursAgo: 72 },
    { title: "Webhook integrations", description: "Send events to external URLs when key actions happen.", priority: "medium", source: "manual", hoursAgo: 96 },
    { title: "Calendar sync", description: "Bi-directional sync with Google Calendar and Outlook.", priority: "medium", source: "client", hoursAgo: 168 },
  ];

  await prisma.wishlistItem.createMany({
    data: wishlistData.map((w) => ({
      title: w.title,
      description: w.description,
      priority: w.priority,
      source: w.source,
      status: "pending",
      clientId,
      projectId: project.id,
      createdAt: new Date(now - w.hoursAgo * 3600000),
    })),
  });

  const costData = [
    { action: "build", inputTokens: 12500, outputTokens: 8200, costCents: 16.05, hoursAgo: 1 },
    { action: "build", inputTokens: 9800, outputTokens: 6100, costCents: 12.09, hoursAgo: 3 },
    { action: "feedback_analysis", inputTokens: 3200, outputTokens: 1800, costCents: 3.66, hoursAgo: 4 },
    { action: "suggestion_extraction", inputTokens: 8500, outputTokens: 4200, costCents: 8.85, hoursAgo: 8 },
    { action: "codebase_analysis", inputTokens: 45000, outputTokens: 12000, costCents: 31.50, hoursAgo: 12 },
    { action: "build", inputTokens: 15000, outputTokens: 11000, costCents: 21.00, hoursAgo: 24 },
    { action: "transcription", inputTokens: 18000, outputTokens: 5500, costCents: 13.65, hoursAgo: 30 },
    { action: "feedback_analysis", inputTokens: 4100, outputTokens: 2200, costCents: 4.53, hoursAgo: 48 },
    { action: "build", inputTokens: 22000, outputTokens: 14500, costCents: 28.35, hoursAgo: 50 },
    { action: "demo_generation", inputTokens: 11000, outputTokens: 9200, costCents: 17.10, hoursAgo: 96 },
    { action: "codebase_analysis", inputTokens: 52000, outputTokens: 14000, costCents: 36.60, hoursAgo: 144 },
    { action: "build", inputTokens: 18500, outputTokens: 12200, costCents: 23.85, hoursAgo: 192 },
  ];

  await prisma.costEntry.createMany({
    data: costData.map((c) => ({
      projectId: project.id,
      action: c.action,
      model: "claude-sonnet-4-6",
      inputTokens: c.inputTokens,
      outputTokens: c.outputTokens,
      costCents: c.costCents,
      createdAt: new Date(now - c.hoursAgo * 3600000),
    })),
  });

  const workspaceId = client.workspaceId;
  const activityData = [
    { action: "build_completed", category: "build", description: 'Build completed for "User authentication flow"', userName: "Claude Code", hoursAgo: 1 },
    { action: "feature_created", category: "feature", description: 'Feature "Analytics dashboard" created from wishlist', userName: "Ryan Haugland", hoursAgo: 4 },
    { action: "member_added", category: "team", description: "Added Sarah Chen as editor", userName: "Ryan Haugland", hoursAgo: 6 },
    { action: "build_completed", category: "build", description: 'Build completed for "File management system"', userName: "Claude Code", hoursAgo: 8 },
    { action: "feature_created", category: "feature", description: 'Feature "File management system" created', userName: "Sarah Chen", hoursAgo: 10 },
    { action: "member_added", category: "team", description: "Added Alex Rivera as member", userName: "Ryan Haugland", hoursAgo: 18 },
    { action: "build_failed", category: "build", description: 'Build failed for "Payment integration" — timeout', userName: "Claude Code", hoursAgo: 24 },
    { action: "feature_toggled_off", category: "feature", description: '"Legacy reporting module" toggled off', userName: "Ryan Haugland", hoursAgo: 30 },
    { action: "build_completed", category: "build", description: 'Build completed for "Notification system"', userName: "Claude Code", hoursAgo: 50 },
    { action: "build_completed", category: "build", description: 'Build completed for "Dashboard widgets"', userName: "Claude Code", hoursAgo: 120 },
  ];

  await prisma.activityLog.createMany({
    data: activityData.map((a) => ({
      workspaceId,
      projectId: project.id,
      userName: a.userName,
      action: a.action,
      category: a.category,
      description: a.description,
      metadata: { isDummy: true },
      createdAt: new Date(now - a.hoursAgo * 3600000),
    })),
  });

  return NextResponse.json(project, { status: 201 });
}
