import { readFile } from "fs/promises";
import { join } from "path";

export type FrameworkInfo = {
  name: "nextjs" | "vite" | "unknown";
  startCommand: (port: number) => string;
};

export async function detectFramework(projectDir: string): Promise<FrameworkInfo> {
  let packageJson: Record<string, unknown>;

  try {
    const raw = await readFile(join(projectDir, "package.json"), "utf-8");
    packageJson = JSON.parse(raw);
  } catch {
    return {
      name: "unknown",
      startCommand: (port) => `PORT=${port} npm run dev`,
    };
  }

  const deps: Record<string, string> =
    typeof packageJson.dependencies === "object" && packageJson.dependencies !== null
      ? (packageJson.dependencies as Record<string, string>)
      : {};

  const devDeps: Record<string, string> =
    typeof packageJson.devDependencies === "object" && packageJson.devDependencies !== null
      ? (packageJson.devDependencies as Record<string, string>)
      : {};

  const all = { ...deps, ...devDeps };

  if ("next" in all) {
    return {
      name: "nextjs",
      startCommand: (port) => `npx next dev -p ${port}`,
    };
  }

  if ("vite" in all || "@vitejs/plugin-react" in all) {
    return {
      name: "vite",
      startCommand: (port) => `npx vite --port ${port}`,
    };
  }

  return {
    name: "unknown",
    startCommand: (port) => `PORT=${port} npm run dev`,
  };
}
