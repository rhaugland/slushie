import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { callClaude } from "@/lib/ai";
import { feedbackAnalyzerPrompt } from "@/prompts/feedback-analyzer";
import { feedbackAnalysisSchema } from "@/lib/schemas";

export const analyzeFeedback = inngest.createFunction(
  {
    id: "feedback-analyze",
    retries: 2,
    triggers: [{ event: "feedback/analyze" }],
  },
  async ({ event, step }) => {
    const { feedbackItemId } = event.data;

    const feedbackItem = await step.run("load-feedback", async () => {
      return prisma.feedbackItem.findUniqueOrThrow({
        where: { id: feedbackItemId },
        include: { project: { select: { id: true, clientId: true } } },
      });
    });

    const analysis = await step.run("analyze", async () => {
      const prompt = feedbackAnalyzerPrompt(feedbackItem.text);

      const raw = await callClaude({
        systemPrompt: prompt.system,
        userMessage: prompt.user,
        temperature: 0.1,
      });

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in response");
      return feedbackAnalysisSchema.parse(JSON.parse(jsonMatch[0]));
    });

    await step.run("save-analysis", async () => {
      const wishlistItem = await prisma.wishlistItem.create({
        data: {
          title: analysis.title,
          description: analysis.description,
          priority: analysis.priority,
          source: "feedback",
          status: "pending",
          clientId: feedbackItem.project.clientId,
          projectId: feedbackItem.projectId,
        },
      });

      await prisma.feedbackItem.update({
        where: { id: feedbackItemId },
        data: {
          title: analysis.title,
          description: analysis.description,
          priority: analysis.priority,
          featureType: analysis.featureType,
          wishlistItemId: wishlistItem.id,
          status: "reviewed",
        },
      });
    });

    return { feedbackItemId, title: analysis.title };
  }
);
