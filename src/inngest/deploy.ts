import { inngest } from "./client";
import { prisma } from "@/lib/prisma";

export const deploy = inngest.createFunction(
  {
    id: "build-deploy",
    retries: 3,
    triggers: [{ event: "build/deploy" }],
  },
  async ({ event, step }) => {
    const { buildId } = event.data;

    const build = await step.run("load-build", async () => {
      return prisma.build.findUniqueOrThrow({
        where: { id: buildId },
        include: { objective: { include: { meeting: { include: { client: true } } } } },
      });
    });

    const sourceFiles = await step.run("download-source", async () => {
      const res = await fetch(build.sourceCodeUrl!);
      const data = await res.json();
      return data.files as { path: string; content: string }[];
    });

    const projectName = `slushie-${build.objective.meeting.client.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${buildId.slice(0, 6)}`;

    const deploymentUrl = await step.run("deploy-to-vercel", async () => {
      const response = await fetch("https://api.vercel.com/v13/deployments", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: projectName,
          files: sourceFiles.map((f) => ({
            file: f.path,
            data: Buffer.from(f.content).toString("base64"),
            encoding: "base64",
          })),
          projectSettings: {
            framework: null,
          },
          target: "production",
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Vercel deploy failed: ${err}`);
      }

      const result = await response.json();
      return `https://${result.url}`;
    });

    await step.run("update-build-live", async () => {
      await prisma.$transaction([
        prisma.build.update({
          where: { id: buildId },
          data: {
            deployUrl: deploymentUrl,
            deployStatus: "live",
            logs: `Deployed to ${deploymentUrl}`,
          },
        }),
        prisma.objective.update({
          where: { id: build.objectiveId },
          data: { status: "deployed" },
        }),
      ]);
    });

    return { buildId, deploymentUrl };
  }
);
