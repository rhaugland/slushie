import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { detectFramework } from "@/lib/framework-detect";
import { injectManifest } from "@/lib/manifest-inject";
import AdmZip from "adm-zip";
import { readFile, mkdir, rm } from "fs/promises";
import { readdirSync, statSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

export const deployCodebase = inngest.createFunction(
  {
    id: "project-deploy-codebase",
    retries: 1,
    triggers: [{ event: "project/deploy-codebase" }],
  },
  async ({ event, step }) => {
    const { projectId, fileUrl } = event.data;

    const project = await step.run("load-project", async () => {
      const p = await prisma.project.update({
        where: { id: projectId },
        data: { deployStatus: "starting" },
      });
      return p;
    });

    const projectDir = await step.run("extract-zip", async () => {
      const slug = project.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
      const dir = path.join(process.cwd(), "previews", slug);

      // Clean existing preview if any
      try { await rm(dir, { recursive: true, force: true }); } catch {}
      await mkdir(dir, { recursive: true });

      // Read and extract zip
      const zipPath = path.join(process.cwd(), "public", fileUrl);
      const zipBuffer = await readFile(zipPath);
      const zip = new AdmZip(zipBuffer);

      // Extract to a temp dir first to handle root folder in zip
      const tempDir = dir + "_tmp";
      await mkdir(tempDir, { recursive: true });
      zip.extractAllTo(tempDir, true);

      // Check if zip has a single root directory
      const entries = readdirSync(tempDir);

      if (entries.length === 1 && statSync(path.join(tempDir, entries[0])).isDirectory()) {
        const innerDir = path.join(tempDir, entries[0]);
        await execAsync(`mv "${innerDir}"/* "${innerDir}"/.[!.]* "${dir}/" 2>/dev/null; true`);
      } else {
        await execAsync(`mv "${tempDir}"/* "${tempDir}"/.[!.]* "${dir}/" 2>/dev/null; true`);
      }

      try { await rm(tempDir, { recursive: true, force: true }); } catch {}

      return dir;
    });

    const framework = await step.run("detect-framework", async () => {
      const fw = await detectFramework(projectDir);
      return { name: fw.name, startCmd: fw.startCommand(0).replace("0", "__PORT__") };
    });

    await step.run("inject-manifest", async () => {
      const features = await prisma.feature.findMany({
        where: { projectId, parentId: null },
        orderBy: { sortOrder: "asc" },
      });

      const fw = await detectFramework(projectDir);

      await injectManifest(
        projectDir,
        features.map((f) => ({
          id: f.id,
          title: f.title,
          route: f.route || "/" + f.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          enabled: f.enabled,
        })),
        fw
      );
    });

    const port = await step.run("install-and-start", async () => {
      await execAsync("npm install --legacy-peer-deps 2>&1", {
        cwd: projectDir,
        timeout: 180000,
      });

      const portNum = 4000 + (parseInt(projectId.slice(-4), 36) % 1000);

      const fw = await detectFramework(projectDir);
      const cmd = fw.startCommand(portNum);

      exec(
        `nohup bash -c '${cmd}' > /tmp/slushie-project-${portNum}.log 2>&1 &`,
        { cwd: projectDir }
      );

      return portNum;
    });

    await step.run("update-project", async () => {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          deployUrl: `http://localhost:${port}`,
          deployStatus: "running",
          port,
        },
      });
    });

    return { projectId, port };
  }
);
