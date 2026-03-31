import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { callClaude } from "@/lib/ai";
import { architectPlanSchema } from "@/lib/schemas";
import { ARCHITECT_SYSTEM } from "@/prompts/architect";

export const architect = inngest.createFunction(
  {
    id: "objective-architect",
    retries: 2,
    triggers: [{ event: "objective/architect" }],
  },
  async ({ event, step }) => {
    const { objectiveId } = event.data;

    const context = await step.run("load-context", async () => {
      const objective = await prisma.objective.findUniqueOrThrow({
        where: { id: objectiveId },
        include: {
          meeting: {
            include: {
              client: true,
            },
          },
        },
      });
      return {
        objective: { title: objective.title, description: objective.description },
        client: { name: objective.meeting.client.name, firm: objective.meeting.client.firm },
      };
    });

    await step.run("update-status-architecting", async () => {
      await prisma.objective.update({
        where: { id: objectiveId },
        data: { status: "architecting" },
      });
    });

    const plan = await step.run("architect-with-claude", async () => {
      const raw = await callClaude({
        systemPrompt: ARCHITECT_SYSTEM,
        userMessage: `Client: ${context.client.name} (${context.client.firm})

Objective: ${context.objective.title}
Description: ${context.objective.description}

Design the best technical approach to build this.`,
        temperature: 0.3,
      });

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in Claude response");

      return architectPlanSchema.parse(JSON.parse(jsonMatch[0]));
    });

    await step.run("save-build-record", async () => {
      await prisma.build.create({
        data: {
          objectiveId,
          architectPlan: plan,
          deployStatus: "planning",
        },
      });
    });

    return { objectiveId, plan };
  }
);
