import { prisma } from "./prisma";

type LogParams = {
  workspaceId: string;
  projectId?: string;
  userId?: string;
  userName?: string;
  action: string;
  category: "build" | "feature" | "team" | "variant" | "general";
  description: string;
  metadata?: Record<string, any>;
};

export async function logActivity(params: LogParams) {
  try {
    await prisma.activityLog.create({
      data: {
        workspaceId: params.workspaceId,
        projectId: params.projectId || null,
        userId: params.userId || null,
        userName: params.userName || null,
        action: params.action,
        category: params.category,
        description: params.description,
        metadata: params.metadata || {},
      },
    });
  } catch (e) {
    // Don't let logging failures break the app
    console.error("[activity-log] Failed to log:", e);
  }
}
