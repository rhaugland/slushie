import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { callClaude } from "@/lib/ai";
import { featureBuilderPrompt } from "@/prompts/feature-builder";
import { featureModuleSchema } from "@/lib/schemas";
import { writeFile, mkdir } from "fs/promises";
import { readManifest, writeManifest, addFeatureToManifest } from "@/lib/manifest";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const STEPS = [
  "Preparing build context...",
  "Claude is generating the module...",
  "Writing module files...",
  "Running database migrations...",
  "Updating manifest...",
];

export const buildFeature = inngest.createFunction(
  {
    id: "feature-build",
    retries: 2,
    triggers: [{ event: "feature/build" }],
  },
  async ({ event, step }) => {
    const { buildId, featureId, projectId } = event.data;

    const updateLogs = async (stepNum: number) => {
      await prisma.featureBuild.update({
        where: { id: buildId },
        data: {
          buildLogs: JSON.stringify({
            step: stepNum,
            total: STEPS.length,
            message: STEPS[stepNum],
          }),
        },
      });
    };

    const context = await step.run("prepare-context", async () => {
      await updateLogs(0);

      const feature = await prisma.feature.findUniqueOrThrow({
        where: { id: featureId },
        include: { project: true },
      });

      const siblings = await prisma.feature.findMany({
        where: {
          projectId,
          id: { not: featureId },
          status: "live",
          enabled: true,
        },
      });

      const slug = feature.project.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
      const projectDir = path.join(process.cwd(), "previews", slug);
      let existingTables = "";
      try {
        const { stdout } = await execAsync(
          `sqlite3 ${path.join(projectDir, "data.db")} ".schema" 2>/dev/null || echo ""`
        );
        existingTables = stdout;
      } catch { /* no db yet */ }

      return {
        title: feature.title,
        description: feature.description,
        projectName: feature.project.name,
        projectDir,
        existingTables,
        siblingFeatures: siblings.map((s) => ({ title: s.title, tables: "" })),
        themeVars: "",
        parentId: feature.parentId,
      };
    });

    const files = await step.run("generate-module", async () => {
      await updateLogs(1);

      const prompt = featureBuilderPrompt({
        title: context.title,
        description: context.description,
        existingTables: context.existingTables,
        siblingFeatures: context.siblingFeatures,
        themeVars: context.themeVars,
      });

      const raw = await callClaude({
        systemPrompt: prompt.system,
        userMessage: prompt.user,
        temperature: 0.2,
        maxTokens: 32000,
      });

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in Claude response");

      let jsonStr = jsonMatch[0];
      try {
        return featureModuleSchema.parse(JSON.parse(jsonStr));
      } catch {
        jsonStr = jsonStr.replace(/,\s*$/, "");
        if (!jsonStr.endsWith("]}")) {
          const lastComplete = jsonStr.lastIndexOf("}");
          if (lastComplete > 0) {
            jsonStr = jsonStr.substring(0, lastComplete + 1) + "]}";
          }
        }
        return featureModuleSchema.parse(JSON.parse(jsonStr));
      }
    });

    await step.run("write-files", async () => {
      await updateLogs(2);

      const featureDir = path.join(context.projectDir, "features", featureId);

      for (const file of files.files) {
        const filePath = path.join(featureDir, file.path);
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, file.content);
      }
    });

    await step.run("run-migrations", async () => {
      await updateLogs(3);

      const schemaPath = path.join(
        context.projectDir, "features", featureId, "schema.sql"
      );
      try {
        const dbPath = path.join(context.projectDir, "data.db");
        await execAsync(`sqlite3 "${dbPath}" < "${schemaPath}" 2>&1`);
      } catch { /* no schema.sql or migration error — non-fatal */ }
    });

    await step.run("update-manifest", async () => {
      await updateLogs(4);

      const parentFeature = context.parentId
        ? await prisma.feature.findUnique({ where: { id: context.parentId } })
        : null;
      const routeBase = parentFeature
        ? `/features/${context.parentId}/${featureId}`
        : `/features/${featureId}`;

      const manifest = await readManifest(context.projectDir);
      const updated = addFeatureToManifest(manifest, {
        id: featureId,
        title: context.title,
        route: routeBase,
        parentId: context.parentId,
      });
      await writeManifest(context.projectDir, updated);

      await prisma.$transaction([
        prisma.featureBuild.update({
          where: { id: buildId },
          data: {
            generatedCode: files as object,
            status: "complete",
            buildLogs: JSON.stringify({
              step: STEPS.length,
              total: STEPS.length,
              message: "Build complete!",
            }),
          },
        }),
        prisma.feature.update({
          where: { id: featureId },
          data: { status: "live", enabled: true },
        }),
        prisma.project.update({
          where: { id: projectId },
          data: { manifestJson: updated as object },
        }),
      ]);
    });

    return { buildId, featureId, fileCount: files.files.length };
  }
);
