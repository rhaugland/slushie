import { execSync } from "child_process";
import path from "path";

/**
 * Find the actual preview directory for a project.
 * Checks the running dev server process for the port, falls back to slug-based path.
 */
export function findPreviewDir(project: { name: string; port?: number | null }): string {
  if (project.port) {
    try {
      const psOut = execSync(
        `ps aux | grep "port ${project.port}" | grep -v grep`,
        { encoding: "utf-8", timeout: 5000, shell: "/bin/bash" }
      ).trim();
      const match = psOut.match(/previews\/([^\s/]+)/);
      if (match) {
        return path.join(process.cwd(), "previews", match[1]);
      }
    } catch { /* fall through */ }
  }
  const slug = project.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
  return path.join(process.cwd(), "previews", slug);
}
