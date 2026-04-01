import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { exec } from "child_process";
import { promisify } from "util";
import { cp } from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

export const createProject = inngest.createFunction(
  {
    id: "project-create",
    retries: 1,
    triggers: [{ event: "project/create" }],
  },
  async ({ event, step }) => {
    const { projectId } = event.data;

    const project = await step.run("load-project", async () => {
      return prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    });

    const projectDir = await step.run("copy-shell", async () => {
      const slug = project.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
      const dir = path.join(process.cwd(), "previews", slug);
      const templateDir = path.join(process.cwd(), "templates", "base-shell");

      await cp(templateDir, dir, { recursive: true });

      await prisma.project.update({
        where: { id: projectId },
        data: { deployStatus: "starting" },
      });

      return dir;
    });

    const port = await step.run("install-and-start", async () => {
      await execAsync("npm install --legacy-peer-deps 2>&1", {
        cwd: projectDir,
        timeout: 120000,
      });

      const portNum = 4000 + (parseInt(projectId.slice(-4), 36) % 1000);

      exec(
        `nohup bash -c 'PORT=${portNum} npm run dev' > /tmp/slushie-project-${portNum}.log 2>&1 &`,
        { cwd: projectDir }
      );

      return portNum;
    });

    await step.run("update-project", async () => {
      const url = `http://localhost:${port}`;
      await prisma.project.update({
        where: { id: projectId },
        data: {
          deployUrl: url,
          deployStatus: "running",
          port,
        },
      });
      return url;
    });

    return { projectId, port };
  }
);
