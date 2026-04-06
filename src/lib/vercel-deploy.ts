import { readFile, readdir, stat } from "fs/promises";
import { join, relative } from "path";
import { createHash } from "crypto";

const VERCEL_API = "https://api.vercel.com";

// Max file size for inline upload (Vercel limit is 100MB per file)
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".vercel", "dist"]);
const SKIP_EXTENSIONS = new Set([".lock", ".log"]);

type VercelFile = {
  file: string;
  sha: string;
  size: number;
  data?: string; // base64
};

async function collectFiles(dir: string, base: string): Promise<VercelFile[]> {
  const files: VercelFile[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith(".") && entry.name !== ".env") continue;

    const fullPath = join(dir, entry.name);
    const relPath = relative(base, fullPath);

    if (entry.isDirectory()) {
      const sub = await collectFiles(fullPath, base);
      files.push(...sub);
    } else if (entry.isFile()) {
      if (SKIP_EXTENSIONS.has(entry.name.substring(entry.name.lastIndexOf(".")))) continue;

      const info = await stat(fullPath);
      if (info.size > 10 * 1024 * 1024) continue; // skip files > 10MB

      const content = await readFile(fullPath);
      const sha = createHash("sha1").update(content).digest("hex");

      files.push({
        file: relPath,
        sha,
        size: info.size,
        data: content.toString("base64"),
      });
    }
  }

  return files;
}

export async function deployToVercel(
  projectDir: string,
  projectName: string
): Promise<{ url: string; deploymentId: string }> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) throw new Error("VERCEL_TOKEN not set");

  const teamId = process.env.VERCEL_TEAM_ID || undefined;
  const teamQuery = teamId ? `?teamId=${teamId}` : "";

  // Collect all files
  const files = await collectFiles(projectDir, projectDir);

  // Upload missing files first
  const missingCheck = await fetch(`${VERCEL_API}/v2/files${teamQuery}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(files.map((f) => ({ sha: f.sha, size: f.size }))),
  });

  if (missingCheck.ok) {
    const missing: string[] = await missingCheck.json();
    // Upload any missing files
    for (const sha of missing) {
      const file = files.find((f) => f.sha === sha);
      if (!file?.data) continue;

      await fetch(`${VERCEL_API}/v2/files${teamQuery}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
          "x-vercel-digest": sha,
        },
        body: Buffer.from(file.data, "base64"),
      });
    }
  }

  // Create deployment
  const slug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);

  const deployRes = await fetch(`${VERCEL_API}/v13/deployments${teamQuery}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `slushie-preview-${slug}`,
      files: files.map((f) => ({
        file: f.file,
        sha: f.sha,
        size: f.size,
      })),
      projectSettings: {
        framework: null, // auto-detect
        installCommand: "npm install --legacy-peer-deps",
      },
      target: "production",
    }),
  });

  if (!deployRes.ok) {
    const err = await deployRes.text();
    throw new Error(`Vercel deployment failed: ${deployRes.status} ${err}`);
  }

  const deployment = await deployRes.json();
  const deploymentId = deployment.id;

  // Poll for ready (max 5 minutes)
  const maxWait = 300_000;
  const start = Date.now();
  let url = `https://${deployment.url}`;

  while (Date.now() - start < maxWait) {
    const statusRes = await fetch(
      `${VERCEL_API}/v13/deployments/${deploymentId}${teamQuery}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (statusRes.ok) {
      const status = await statusRes.json();
      if (status.readyState === "READY") {
        url = `https://${status.url}`;
        break;
      }
      if (status.readyState === "ERROR") {
        throw new Error(`Vercel deployment failed: ${status.errorMessage || "unknown error"}`);
      }
    }

    await new Promise((r) => setTimeout(r, 5000));
  }

  return { url, deploymentId };
}

export async function deleteVercelDeployment(deploymentId: string): Promise<void> {
  const token = process.env.VERCEL_TOKEN;
  if (!token) return;

  const teamId = process.env.VERCEL_TEAM_ID || undefined;
  const teamQuery = teamId ? `?teamId=${teamId}` : "";

  await fetch(`${VERCEL_API}/v13/deployments/${deploymentId}${teamQuery}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}
