import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Find user's workspace and first project
  const membership = user.memberships[0];
  if (!membership) return NextResponse.json({ error: "No workspace" }, { status: 400 });

  const workspaceId = membership.workspaceId;

  const project = await prisma.project.findFirst({
    where: { workspaceId },
    include: { client: true },
  });

  if (!project) return NextResponse.json({ error: "No project found" }, { status: 400 });

  const projectId = project.id;
  const clientId = project.clientId;
  const now = Date.now();

  const counts: Record<string, number> = {};

  // --- NOTES (Meetings of type text_note) ---
  const noteData = [
    { text: "Client wants the dashboard to load in under 2 seconds. Current P95 is around 4.5s. Need to look at the waterfall — too many sequential API calls on mount.", by: "Ryan Haugland", hoursAgo: 2 },
    { text: "Sarah mentioned they're switching from Stripe to a custom billing system in Q3. We should keep the payment integration loosely coupled.", by: "Sarah Chen", hoursAgo: 8 },
    { text: "The onboarding flow has a 40% drop-off at the team invite step. Hypothesis: requiring 3 team members is too aggressive. Let's test with optional invites.", by: "Ryan Haugland", hoursAgo: 18 },
    { text: "API rate limits are hitting harder than expected. The batch import endpoint needs to queue jobs instead of processing inline. Inngest would be perfect here.", by: "Alex Rivera", hoursAgo: 26 },
    { text: "Accessibility audit flagged 12 critical issues — mostly missing ARIA labels on interactive elements and poor color contrast on the secondary buttons.", by: "Sarah Chen", hoursAgo: 48 },
    { text: "Client demo went well. They loved the real-time preview but asked about white-labeling the header. Adding to the feature backlog.", by: "Ryan Haugland", hoursAgo: 72 },
    { text: "Need to investigate the memory leak in the WebSocket handler. Connections aren't being cleaned up on disconnect. Seeing ~50MB growth per hour in staging.", by: "Alex Rivera", hoursAgo: 96 },
    { text: "Discussed migration strategy from MongoDB to Postgres. Agreed on a dual-write period of 2 weeks before cutting over. Ryan to set up the shadow database.", by: "Sarah Chen", hoursAgo: 120 },
  ];

  const notes = await prisma.meeting.createMany({
    data: noteData.map((n) => ({
      projectId,
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
  counts.notes = notes.count;

  // --- FEEDBACK ---
  const feedbackData = [
    { text: "The search is way too slow when we have more than 500 contacts. Takes 3-4 seconds to show results.", title: "Search performance degrades with large datasets", priority: "high", source: "client", status: "pending", hoursAgo: 3 },
    { text: "Love the new dashboard layout! The chart animations are really smooth.", title: "Positive feedback on dashboard redesign", priority: "low", source: "client", status: "reviewed", hoursAgo: 12 },
    { text: "Can we get CSV export on the analytics page? Right now I have to screenshot the charts for reports.", title: "CSV export for analytics data", priority: "medium", source: "client", status: "pending", hoursAgo: 24 },
    { text: "The mobile view is completely broken on the settings page. Can't reach the save button.", title: "Settings page not responsive on mobile", priority: "high", source: "client", status: "pending", hoursAgo: 36 },
    { text: "It would be nice if we could customize the color of status tags. The defaults don't match our brand.", title: "Customizable status tag colors", priority: "low", source: "client", status: "dismissed", hoursAgo: 48 },
    { text: "File uploads keep timing out for anything over 10MB. We need to upload proposal PDFs regularly.", title: "File upload timeout for large files", priority: "high", source: "internal", status: "reviewed", hoursAgo: 72 },
    { text: "The notification system sends too many emails. Need a way to batch or digest notifications.", title: "Notification batching/digest mode", priority: "medium", source: "internal", status: "pending", hoursAgo: 96 },
    { text: "Great improvement on the invite flow — the new magic link approach is much smoother than the old password setup.", title: "Magic link auth working well", priority: "low", source: "client", status: "reviewed", hoursAgo: 144 },
    { text: "When I archive a project it still shows up in search results. Archived items should be hidden by default.", title: "Archived projects appear in search", priority: "medium", source: "client", status: "pending", hoursAgo: 168 },
    { text: "Need dark mode. The white background is painful during late-night sessions.", title: "Dark mode support", priority: "medium", source: "client", status: "pending", hoursAgo: 200 },
  ];

  const feedback = await prisma.feedbackItem.createMany({
    data: feedbackData.map((f) => ({
      projectId,
      text: f.text,
      title: f.title,
      description: f.text,
      priority: f.priority,
      source: f.source,
      status: f.status,
      createdAt: new Date(now - f.hoursAgo * 3600000),
    })),
  });
  counts.feedback = feedback.count;

  // --- WISHLIST ---
  const wishlistData = [
    { title: "Role-based access control", description: "Different permission levels: admin, editor, viewer. Control who can modify settings vs just view data.", priority: "high", source: "meeting", hoursAgo: 5 },
    { title: "Audit trail / activity log", description: "Track who changed what and when. Important for compliance and debugging.", priority: "high", source: "feedback", hoursAgo: 12 },
    { title: "Bulk import from Salesforce", description: "One-click sync of contacts and deals from Salesforce CRM.", priority: "medium", source: "client", hoursAgo: 24 },
    { title: "Custom report builder", description: "Drag-and-drop interface to create custom reports with charts, tables, and filters.", priority: "medium", source: "meeting", hoursAgo: 48 },
    { title: "Two-factor authentication", description: "SMS or TOTP-based 2FA for enhanced account security.", priority: "high", source: "client", hoursAgo: 72 },
    { title: "Webhook integrations", description: "Send events to external URLs when key actions happen (new contact, deal closed, etc).", priority: "medium", source: "manual", hoursAgo: 96 },
    { title: "Email template editor", description: "WYSIWYG editor for creating and managing email templates with merge fields.", priority: "low", source: "meeting", hoursAgo: 120 },
    { title: "Calendar sync", description: "Bi-directional sync with Google Calendar and Outlook for meeting scheduling.", priority: "medium", source: "client", hoursAgo: 168 },
  ];

  const wishlist = await prisma.wishlistItem.createMany({
    data: wishlistData.map((w) => ({
      title: w.title,
      description: w.description,
      priority: w.priority,
      source: w.source,
      status: "pending",
      clientId,
      projectId,
      createdAt: new Date(now - w.hoursAgo * 3600000),
    })),
  });
  counts.wishlist = wishlist.count;

  // --- COST ENTRIES ---
  const costData = [
    { action: "build", model: "claude-sonnet-4-6", inputTokens: 12500, outputTokens: 8200, costCents: 16.05, hoursAgo: 1 },
    { action: "build", model: "claude-sonnet-4-6", inputTokens: 9800, outputTokens: 6100, costCents: 12.09, hoursAgo: 3 },
    { action: "feedback_analysis", model: "claude-sonnet-4-6", inputTokens: 3200, outputTokens: 1800, costCents: 3.66, hoursAgo: 4 },
    { action: "suggestion_extraction", model: "claude-sonnet-4-6", inputTokens: 8500, outputTokens: 4200, costCents: 8.85, hoursAgo: 8 },
    { action: "codebase_analysis", model: "claude-sonnet-4-6", inputTokens: 45000, outputTokens: 12000, costCents: 31.50, hoursAgo: 12 },
    { action: "build", model: "claude-sonnet-4-6", inputTokens: 15000, outputTokens: 11000, costCents: 21.00, hoursAgo: 24 },
    { action: "classification", model: "claude-sonnet-4-6", inputTokens: 2100, outputTokens: 800, costCents: 1.83, hoursAgo: 26 },
    { action: "transcription", model: "claude-sonnet-4-6", inputTokens: 18000, outputTokens: 5500, costCents: 13.65, hoursAgo: 30 },
    { action: "feedback_analysis", model: "claude-sonnet-4-6", inputTokens: 4100, outputTokens: 2200, costCents: 4.53, hoursAgo: 48 },
    { action: "build", model: "claude-sonnet-4-6", inputTokens: 22000, outputTokens: 14500, costCents: 28.35, hoursAgo: 50 },
    { action: "suggest_minors", model: "claude-sonnet-4-6", inputTokens: 6500, outputTokens: 3800, costCents: 7.65, hoursAgo: 72 },
    { action: "demo_generation", model: "claude-sonnet-4-6", inputTokens: 11000, outputTokens: 9200, costCents: 17.10, hoursAgo: 96 },
    { action: "build", model: "claude-sonnet-4-6", inputTokens: 13200, outputTokens: 8800, costCents: 17.16, hoursAgo: 120 },
    { action: "codebase_analysis", model: "claude-sonnet-4-6", inputTokens: 52000, outputTokens: 14000, costCents: 36.60, hoursAgo: 144 },
    { action: "transcription", model: "claude-sonnet-4-6", inputTokens: 22000, outputTokens: 6000, costCents: 15.60, hoursAgo: 168 },
    { action: "build", model: "claude-sonnet-4-6", inputTokens: 18500, outputTokens: 12200, costCents: 23.85, hoursAgo: 192 },
    { action: "feedback_analysis", model: "claude-sonnet-4-6", inputTokens: 5200, outputTokens: 2800, costCents: 5.76, hoursAgo: 216 },
    { action: "suggestion_extraction", model: "claude-sonnet-4-6", inputTokens: 7800, outputTokens: 3900, costCents: 8.19, hoursAgo: 240 },
  ];

  const costs = await prisma.costEntry.createMany({
    data: costData.map((c) => ({
      projectId,
      action: c.action,
      model: c.model,
      inputTokens: c.inputTokens,
      outputTokens: c.outputTokens,
      costCents: c.costCents,
      createdAt: new Date(now - c.hoursAgo * 3600000),
    })),
  });
  counts.costs = costs.count;

  // --- ACTIVITY LOG (changelog/team) ---
  const activityData = [
    { action: "build_completed", category: "build", description: 'Build completed for "User authentication flow"', userName: "Claude Code", hoursAgo: 1 },
    { action: "build_started", category: "build", description: 'Build started for "User authentication flow"', userName: "Ryan Haugland", hoursAgo: 1.5 },
    { action: "feature_toggled_on", category: "feature", description: '"Contact management" toggled on', userName: "Ryan Haugland", hoursAgo: 2 },
    { action: "feature_created", category: "feature", description: 'Feature "Analytics dashboard" created from wishlist', userName: "Ryan Haugland", hoursAgo: 4 },
    { action: "member_added", category: "team", description: "Added Sarah Chen (sarah@ottera.com) as editor", userName: "Ryan Haugland", hoursAgo: 6 },
    { action: "build_completed", category: "build", description: 'Build completed for "File management system"', userName: "Claude Code", hoursAgo: 8 },
    { action: "build_started", category: "build", description: 'Build started for "File management system"', userName: "Sarah Chen", hoursAgo: 9 },
    { action: "feature_created", category: "feature", description: 'Feature "File management system" created', userName: "Sarah Chen", hoursAgo: 10 },
    { action: "variant_created", category: "variant", description: 'Variant B created for "User authentication flow"', userName: "Ryan Haugland", hoursAgo: 12 },
    { action: "member_added", category: "team", description: "Added Alex Rivera (alex@ottera.com) as member", userName: "Ryan Haugland", hoursAgo: 18 },
    { action: "role_changed", category: "team", description: "Sarah Chen role changed to admin", userName: "Ryan Haugland", hoursAgo: 20 },
    { action: "build_failed", category: "build", description: 'Build failed for "Payment integration" — timeout after 120s', userName: "Claude Code", hoursAgo: 24 },
    { action: "build_started", category: "build", description: 'Build started for "Payment integration"', userName: "Alex Rivera", hoursAgo: 25 },
    { action: "feature_toggled_off", category: "feature", description: '"Legacy reporting module" toggled off', userName: "Ryan Haugland", hoursAgo: 30 },
    { action: "feature_deleted", category: "feature", description: 'Feature "Deprecated settings page" deleted', userName: "Ryan Haugland", hoursAgo: 48 },
    { action: "build_completed", category: "build", description: 'Build completed for "Notification system"', userName: "Claude Code", hoursAgo: 50 },
    { action: "build_started", category: "build", description: 'Build started for "Notification system"', userName: "Sarah Chen", hoursAgo: 51 },
    { action: "variant_promoted", category: "variant", description: 'Variant A promoted for "Contact management"', userName: "Ryan Haugland", hoursAgo: 72 },
    { action: "member_invited", category: "team", description: "Invited jordan@client.com to project as viewer", userName: "Ryan Haugland", hoursAgo: 96 },
    { action: "build_completed", category: "build", description: 'Build completed for "Dashboard widgets"', userName: "Claude Code", hoursAgo: 120 },
    { action: "build_started", category: "build", description: 'Build started for "Dashboard widgets"', userName: "Ryan Haugland", hoursAgo: 121 },
    { action: "feature_created", category: "feature", description: 'Feature "Dashboard widgets" created', userName: "Ryan Haugland", hoursAgo: 122 },
  ];

  const activity = await prisma.activityLog.createMany({
    data: activityData.map((a) => ({
      workspaceId,
      projectId,
      userName: a.userName,
      action: a.action,
      category: a.category,
      description: a.description,
      metadata: { isDummy: true },
      createdAt: new Date(now - a.hoursAgo * 3600000),
    })),
  });
  counts.activity = activity.count;

  return NextResponse.json({ ok: true, projectId, counts });
}
