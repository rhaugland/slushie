import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { callClaude } from "@/lib/ai";
import { suggestionExtractorPrompt } from "@/prompts/suggestion-extractor";
import { meetingSuggestionsSchema } from "@/lib/schemas";

export const extractSuggestions = inngest.createFunction(
  {
    id: "meeting-extract-suggestions",
    retries: 2,
    triggers: [{ event: "meeting/extract-suggestions" }],
  },
  async ({ event, step }) => {
    const { meetingId } = event.data;

    const context = await step.run("load-context", async () => {
      const meeting = await prisma.meeting.findUniqueOrThrow({
        where: { id: meetingId },
        include: { project: { include: { features: true } } },
      });

      return {
        transcript: meeting.transcript || "",
        projectId: meeting.project.id,
        existingFeatures: meeting.project.features.map((f) => ({
          title: f.title,
          isMajor: f.parentId === null,
        })),
      };
    });

    const suggestions = await step.run("extract", async () => {
      const prompt = suggestionExtractorPrompt({
        transcript: context.transcript,
        existingFeatures: context.existingFeatures,
      });

      const raw = await callClaude({
        systemPrompt: prompt.system,
        userMessage: prompt.user,
        temperature: 0.1,
      });

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in response");
      return meetingSuggestionsSchema.parse(JSON.parse(jsonMatch[0]));
    });

    await step.run("save-suggestions", async () => {
      for (const s of suggestions.suggestions) {
        await prisma.meetingSuggestion.create({
          data: {
            meetingId,
            suggestedTitle: s.title,
            suggestedDescription: s.description,
            suggestedPriority: s.priority,
            suggestedParentTitle: s.suggestedParent,
            status: "pending",
          },
        });
      }

      await prisma.meeting.update({
        where: { id: meetingId },
        data: { status: "ready" },
      });
    });

    return { meetingId, count: suggestions.suggestions.length };
  }
);
