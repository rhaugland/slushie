import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { callClaude } from "@/lib/ai";
import { objectivesResponseSchema } from "@/lib/schemas";
import { OBJECTIVE_PARSER_SYSTEM } from "@/prompts/objective-parser";

export const extractObjectives = inngest.createFunction(
  {
    id: "meeting-extract-objectives",
    retries: 2,
    triggers: [{ event: "meeting/extract-objectives" }],
  },
  async ({ event, step }) => {
    const { meetingId } = event.data;

    const meeting = await step.run("load-meeting", async () => {
      return prisma.meeting.findUniqueOrThrow({ where: { id: meetingId } });
    });

    if (!meeting.transcript) {
      throw new Error("Meeting has no transcript");
    }

    const parsed = await step.run("extract-with-claude", async () => {
      const raw = await callClaude({
        systemPrompt: OBJECTIVE_PARSER_SYSTEM,
        userMessage: `Here is the meeting transcript:\n\n${meeting.transcript}`,
        temperature: 0,
      });

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in Claude response");

      return objectivesResponseSchema.parse(JSON.parse(jsonMatch[0]));
    });

    await step.run("save-objectives", async () => {
      await prisma.$transaction([
        ...parsed.objectives.map((obj) =>
          prisma.objective.create({
            data: {
              meetingId,
              title: obj.title,
              description: obj.description,
              priority: obj.priority,
              status: "draft",
            },
          })
        ),
        prisma.meeting.update({
          where: { id: meetingId },
          data: { status: "ready" },
        }),
      ]);
    });

    return { meetingId, objectiveCount: parsed.objectives.length };
  }
);
