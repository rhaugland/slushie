import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { callClaude } from "@/lib/ai";
import { buildOutputSchema } from "@/lib/schemas";
import { BUILDER_SYSTEM } from "@/prompts/builder";
import { put } from "@vercel/blob";

export const build = inngest.createFunction(
  {
    id: "objective-build",
    retries: 2,
    triggers: [{ event: "objective/build" }],
  },
  async ({ event, step }) => {
    const { buildId } = event.data;

    const context = await step.run("load-build", async () => {
      const b = await prisma.build.findUniqueOrThrow({
        where: { id: buildId },
        include: { objective: true },
      });
      return {
        buildId: b.id,
        objectiveId: b.objectiveId,
        title: b.objective.title,
        description: b.objective.description,
        architectPlan: b.architectPlan,
      };
    });

    const files = await step.run("generate-code", async () => {
      const raw = await callClaude({
        systemPrompt: BUILDER_SYSTEM,
        userMessage: `Objective: ${context.title}
Description: ${context.description}

Architecture Plan:
${JSON.stringify(context.architectPlan, null, 2)}

Generate the complete source code for this project.`,
        temperature: 0.2,
      });

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in Claude response");

      return buildOutputSchema.parse(JSON.parse(jsonMatch[0]));
    });

    const blobUrl = await step.run("upload-source", async () => {
      const tarContent = JSON.stringify(files);
      const blob = await put(
        `builds/${buildId}/source.json`,
        new Blob([tarContent], { type: "application/json" }),
        { access: "public" }
      );
      return blob.url;
    });

    await step.run("update-build-record", async () => {
      await prisma.build.update({
        where: { id: buildId },
        data: {
          sourceCodeUrl: blobUrl,
          deployStatus: "deploying",
          logs: `Generated ${files.files.length} files`,
        },
      });
    });

    await step.run("trigger-deploy", async () => {
      await inngest.send({
        name: "build/deploy",
        data: { buildId },
      });
    });

    return { buildId, fileCount: files.files.length };
  }
);
