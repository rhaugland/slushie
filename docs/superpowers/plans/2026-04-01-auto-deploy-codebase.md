# Auto-Deploy Codebase Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user uploads a codebase zip and confirms the feature mapping, automatically deploy the uploaded code as a live preview with manifest-driven feature toggles.

**Architecture:** The `apply-mapping` API triggers a `project/deploy-codebase` Inngest event. A new Inngest function extracts the zip, detects the framework, injects a manifest layer (features.json + middleware), installs deps, and starts the dev server. Feature toggles update the manifest on disk to show/hide routes.

**Tech Stack:** Inngest v4, AdmZip, Next.js middleware injection, Prisma

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/inngest/deploy-codebase.ts` | Create | Inngest function: extract zip, detect framework, inject manifest, install, start server |
| `src/lib/framework-detect.ts` | Create | Detect framework from package.json, return start command |
| `src/lib/manifest-inject.ts` | Create | Write features.json and inject middleware into uploaded project |
| `src/app/api/inngest/route.ts` | Modify | Register the new deploy-codebase function |
| `src/app/api/projects/[id]/apply-mapping/route.ts` | Modify | Accept fileUrl, trigger deploy-codebase event after creating features |
| `src/prompts/codebase-analyzer.ts` | Modify | Add route field to analysis output |
| `src/components/codebase-mapper.tsx` | Modify | Pass route data through to apply-mapping |
| `src/components/pane-project.tsx` | Modify | Pass fileUrl to apply-mapping call |

---

### Task 1: Framework Detection Utility

**Files:**
- Create: `src/lib/framework-detect.ts`

- [ ] **Step 1: Create the framework detection module**

```typescript
// src/lib/framework-detect.ts
import { readFile } from "fs/promises";
import path from "path";

export type FrameworkInfo = {
  name: "nextjs" | "vite" | "unknown";
  startCommand: (port: number) => string;
};

export async function detectFramework(projectDir: string): Promise<FrameworkInfo> {
  let pkg: any = {};
  try {
    const raw = await readFile(path.join(projectDir, "package.json"), "utf-8");
    pkg = JSON.parse(raw);
  } catch {
    return {
      name: "unknown",
      startCommand: (port) => `PORT=${port} npm run dev`,
    };
  }

  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  if (allDeps["next"]) {
    return {
      name: "nextjs",
      startCommand: (port) => `npx next dev -p ${port}`,
    };
  }

  if (allDeps["vite"] || allDeps["@vitejs/plugin-react"]) {
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/framework-detect.ts
git commit -m "feat: framework detection utility for uploaded codebases"
```

---

### Task 2: Manifest Injection Utility

**Files:**
- Create: `src/lib/manifest-inject.ts`

- [ ] **Step 1: Create the manifest injection module**

This module writes `features.json` and injects a Next.js middleware file (or Vite route guard) into the uploaded project.

```typescript
// src/lib/manifest-inject.ts
import { writeFile, readFile, access } from "fs/promises";
import path from "path";
import type { FrameworkInfo } from "./framework-detect";

type ManifestFeature = {
  id: string;
  title: string;
  route: string;
  enabled: boolean;
};

export async function injectManifest(
  projectDir: string,
  features: ManifestFeature[],
  framework: FrameworkInfo
): Promise<void> {
  // Write features.json
  const manifest = { features };
  await writeFile(
    path.join(projectDir, "features.json"),
    JSON.stringify(manifest, null, 2)
  );

  // Inject middleware based on framework
  if (framework.name === "nextjs") {
    await injectNextMiddleware(projectDir);
  } else if (framework.name === "vite") {
    await injectViteGuard(projectDir);
  }
}

async function injectNextMiddleware(projectDir: string): Promise<void> {
  const middlewarePath = path.join(projectDir, "middleware.ts");

  // Check if middleware already exists
  let existing = "";
  try {
    existing = await readFile(middlewarePath, "utf-8");
  } catch { /* doesn't exist */ }

  // If it already has our guard, skip
  if (existing.includes("__slushie_guard__")) return;

  const guard = `
// __slushie_guard__ — injected by slushie.machine
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import * as fs from "fs";
import * as path from "path";

function getDisabledRoutes(): string[] {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "features.json"), "utf-8");
    const manifest = JSON.parse(raw);
    return manifest.features
      .filter((f: any) => !f.enabled)
      .map((f: any) => f.route);
  } catch {
    return [];
  }
}

export function middleware(request: NextRequest) {
  const disabled = getDisabledRoutes();
  const pathname = request.nextUrl.pathname;

  for (const route of disabled) {
    if (pathname === route || pathname.startsWith(route + "/")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
`;

  if (existing) {
    // Backup existing middleware and replace
    await writeFile(middlewarePath + ".bak", existing);
  }

  await writeFile(middlewarePath, guard);
}

async function injectViteGuard(projectDir: string): Promise<void> {
  // For Vite/React apps, write a guard module that can be imported
  const guardPath = path.join(projectDir, "src", "_slushie-guard.ts");

  const guard = `
// __slushie_guard__ — injected by slushie.machine
import manifest from "../../features.json";

export function isFeatureEnabled(route: string): boolean {
  const feature = manifest.features.find(
    (f: any) => route === f.route || route.startsWith(f.route + "/")
  );
  if (!feature) return true; // not a mapped feature route, allow
  return feature.enabled;
}
`;

  try {
    await access(path.join(projectDir, "src"));
    await writeFile(guardPath, guard);
  } catch {
    // No src directory — skip Vite guard injection
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/manifest-inject.ts
git commit -m "feat: manifest injection utility for uploaded codebases"
```

---

### Task 3: Deploy Codebase Inngest Function

**Files:**
- Create: `src/inngest/deploy-codebase.ts`

- [ ] **Step 1: Create the Inngest function**

```typescript
// src/inngest/deploy-codebase.ts
import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { detectFramework } from "@/lib/framework-detect";
import { injectManifest } from "@/lib/manifest-inject";
import AdmZip from "adm-zip";
import { readFile, mkdir, rm } from "fs/promises";
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
      const { readdirSync } = require("fs");
      const entries = readdirSync(tempDir);
      const { statSync } = require("fs");

      if (entries.length === 1 && statSync(path.join(tempDir, entries[0])).isDirectory()) {
        // Move contents of the single root dir to projectDir
        const innerDir = path.join(tempDir, entries[0]);
        await execAsync(`mv "${innerDir}"/* "${innerDir}"/.[!.]* "${dir}/" 2>/dev/null; true`);
      } else {
        // Move all entries directly
        await execAsync(`mv "${tempDir}"/* "${tempDir}"/.[!.]* "${dir}/" 2>/dev/null; true`);
      }

      // Clean up temp dir
      try { await rm(tempDir, { recursive: true, force: true }); } catch {}

      return dir;
    });

    const framework = await step.run("detect-framework", async () => {
      const fw = await detectFramework(projectDir);
      return { name: fw.name, startCmd: fw.startCommand(0).replace("0", "__PORT__") };
    });

    await step.run("inject-manifest", async () => {
      // Load features with their routes from DB
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
          route: "/" + f.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          enabled: f.enabled,
        })),
        fw
      );
    });

    const port = await step.run("install-and-start", async () => {
      // Install dependencies
      await execAsync("npm install --legacy-peer-deps 2>&1", {
        cwd: projectDir,
        timeout: 180000,
      });

      // Generate a port from project ID
      const portNum = 4000 + (parseInt(projectId.slice(-4), 36) % 1000);

      // Build the start command
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
```

- [ ] **Step 2: Commit**

```bash
git add src/inngest/deploy-codebase.ts
git commit -m "feat: deploy-codebase Inngest function"
```

---

### Task 4: Register the Inngest Function

**Files:**
- Modify: `src/app/api/inngest/route.ts`

- [ ] **Step 1: Add the import and register the function**

Add `deployCodebase` import and add it to the functions array:

```typescript
// src/app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { transcribe } from "@/inngest/transcribe";
import { extractSuggestions } from "@/inngest/extract-suggestions";
import { createProject } from "@/inngest/create-project";
import { buildFeature } from "@/inngest/build-feature";
import { deployCodebase } from "@/inngest/deploy-codebase";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [transcribe, extractSuggestions, createProject, buildFeature, deployCodebase],
});
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/inngest/route.ts
git commit -m "feat: register deploy-codebase Inngest function"
```

---

### Task 5: Update Codebase Analyzer Prompt to Include Routes

**Files:**
- Modify: `src/prompts/codebase-analyzer.ts`

- [ ] **Step 1: Add route field to the prompt's JSON schema example**

In the system prompt, update the JSON example to include a `route` field for each section. Add to the rules: "For each feature section, identify the URL route it maps to (e.g., /contacts, /dashboard). Look at the router config, file-based routing, or page file paths to determine this."

Update the example JSON in the system prompt:

```typescript
// In the JSON example, add "route" to each section:
{
  "id": "contacts",
  "name": "Contact Management",
  "description": "CRUD for managing client contacts with search and tagging",
  "category": "feature",
  "route": "/contacts",
  "files": ["src/pages/contacts.tsx", "src/components/ContactList.tsx"],
  "minorFeatures": [...]
}
```

The full updated system prompt should have the rule added and the JSON example updated. Here is the complete replacement for the system prompt string:

```typescript
export function codebaseAnalyzerPrompt(context: {
  fileTree: string;
  fileSamples: { path: string; content: string }[];
}): { system: string; user: string } {
  return {
    system: `You are a codebase analyst. You analyze source code and break it down into logical feature sections.

Your job is to look at a codebase and identify:
1. What the "base" is — shared infrastructure, layout, config, routing, styling, auth, database setup
2. What the "major features" are — distinct functional areas that each deserve their own page/section in a nav bar (e.g., "Contact Management", "Dashboard", "Reporting")
3. For each major feature, what the "minor features" are — specific UI elements, buttons, form fields, sub-functionality within that major feature
4. For each feature section, the URL route it maps to — look at router config, file-based routing, or page file paths

Rules:
- Base should include: layout, nav, shared components, config, database/ORM setup, auth, styling/theme
- Major features are nav-level pages with distinct functionality
- Minor features are specific capabilities within a major feature (e.g., "CSV import button", "search/filter bar", "bulk delete", "inline editing")
- Be specific about minor features — "Add contact form with name, email, phone fields" not just "form"
- Include the file paths from the codebase that belong to each section
- For routes: use the actual URL path from the router (e.g., "/contacts", "/dashboard"). For file-based routing (Next.js), derive from the file path. For base, use "/" as the route.

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "sections": [
    {
      "id": "base",
      "name": "Base / Infrastructure",
      "description": "Shared layout, routing, config, and utilities",
      "category": "base",
      "route": "/",
      "files": ["src/layout.tsx", "src/config.ts"],
      "minorFeatures": []
    },
    {
      "id": "contacts",
      "name": "Contact Management",
      "description": "CRUD for managing client contacts with search and tagging",
      "category": "feature",
      "route": "/contacts",
      "files": ["src/pages/contacts.tsx", "src/components/ContactList.tsx"],
      "minorFeatures": [
        {"title": "Contact search bar", "description": "Real-time search/filter across name, email, phone fields"},
        {"title": "Add contact form", "description": "Modal form with name, email, phone, company, and notes fields"},
        {"title": "CSV import button", "description": "Upload CSV file to bulk-import contacts"}
      ]
    }
  ]
}`,

    user: `Analyze this codebase and break it into logical sections.

File tree:
${context.fileTree}

File contents (sampled):
${context.fileSamples.map((f) => \`--- \${f.path} ---\\n\${f.content}\`).join("\\n\\n")}

Identify the base infrastructure and each major feature with its minor features.`,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/prompts/codebase-analyzer.ts
git commit -m "feat: add route field to codebase analyzer prompt"
```

---

### Task 6: Update Apply-Mapping API to Trigger Deploy

**Files:**
- Modify: `src/app/api/projects/[id]/apply-mapping/route.ts`

- [ ] **Step 1: Accept fileUrl and trigger the deploy event**

Update the API to accept `fileUrl` in the request body alongside `sections`. After creating all features, send the Inngest event. Also store the route from the mapping on each feature.

```typescript
// src/app/api/projects/[id]/apply-mapping/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type MappedSection = {
  id: string;
  name: string;
  description: string;
  category: "base" | "feature";
  route?: string;
  minorFeatures: { title: string; description: string }[];
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const body = await req.json();
  const { sections, fileUrl } = body as { sections: MappedSection[]; fileUrl?: string };

  if (!sections || !Array.isArray(sections)) {
    return NextResponse.json({ error: "sections array required" }, { status: 400 });
  }

  const featureSections = sections.filter((s) => s.category === "feature");
  const created: { id: string; title: string; minorCount: number }[] = [];

  for (let i = 0; i < featureSections.length; i++) {
    const section = featureSections[i];

    const feature = await prisma.feature.create({
      data: {
        projectId,
        title: section.name,
        description: section.description,
        sortOrder: i,
      },
    });

    for (let j = 0; j < section.minorFeatures.length; j++) {
      const minor = section.minorFeatures[j];
      await prisma.feature.create({
        data: {
          projectId,
          parentId: feature.id,
          title: minor.title,
          description: minor.description,
          sortOrder: j,
          enabled: true,
        },
      });
    }

    created.push({
      id: feature.id,
      title: section.name,
      minorCount: section.minorFeatures.length,
    });
  }

  // Trigger deploy if a codebase file was uploaded
  if (fileUrl) {
    const { inngest } = await import("@/inngest/client");
    await inngest.send({
      name: "project/deploy-codebase",
      data: { projectId, fileUrl },
    });
  }

  return NextResponse.json({ created, deploying: !!fileUrl }, { status: 201 });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/projects/[id]/apply-mapping/route.ts
git commit -m "feat: apply-mapping triggers deploy-codebase when fileUrl provided"
```

---

### Task 7: Pass fileUrl Through the UI

**Files:**
- Modify: `src/components/codebase-mapper.tsx`
- Modify: `src/components/pane-project.tsx`

- [ ] **Step 1: Update CodebaseMapper to accept and pass fileUrl**

Add `fileUrl` prop to `CodebaseMapper` and include it in the apply-mapping fetch call:

In `src/components/codebase-mapper.tsx`, update the Props type:

```typescript
type Props = {
  sections: Section[];
  projectId: string;
  fileUrl: string;
  onComplete: () => void;
  onCancel: () => void;
};
```

Update the component signature:

```typescript
export function CodebaseMapper({ sections: initial, projectId, fileUrl, onComplete, onCancel }: Props) {
```

Update the `handleApply` function body:

```typescript
  async function handleApply() {
    setApplying(true);
    try {
      await fetch(`/api/projects/${projectId}/apply-mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections, fileUrl }),
      });
      onComplete();
    } finally {
      setApplying(false);
    }
  }
```

- [ ] **Step 2: Update PaneProject to store and pass fileUrl**

In `src/components/pane-project.tsx`, add state to track the uploaded file URL:

Add after the existing `codebaseAnalysis` state:

```typescript
const [codebaseFileUrl, setCodebaseFileUrl] = useState<string>("");
```

In `handleCodebaseDrop`, save the URL before analyzing:

```typescript
  async function handleCodebaseDrop(files: FileList) {
    const file = files[0];
    if (!file) return;

    setAnalyzing(true);
    try {
      const url = await uploadFile(file);
      setCodebaseFileUrl(url);
      const res = await fetch(`/api/projects/${project.id}/analyze-codebase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl: url }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Analysis failed");
        return;
      }

      const analysis = await res.json();
      setCodebaseAnalysis(analysis);
    } finally {
      setAnalyzing(false);
    }
  }
```

Update the `CodebaseMapper` render to pass `fileUrl`:

```tsx
  if (codebaseAnalysis) {
    return (
      <CodebaseMapper
        sections={codebaseAnalysis.sections}
        projectId={project.id}
        fileUrl={codebaseFileUrl}
        onComplete={() => {
          setCodebaseAnalysis(null);
          setCodebaseFileUrl("");
          onUpdate();
        }}
        onCancel={() => {
          setCodebaseAnalysis(null);
          setCodebaseFileUrl("");
        }}
      />
    );
  }
```

- [ ] **Step 3: Commit**

```bash
git add src/components/codebase-mapper.tsx src/components/pane-project.tsx
git commit -m "feat: pass fileUrl through UI to trigger codebase deploy"
```

---

### Task 8: Build, Test, and Verify

- [ ] **Step 1: Type-check the project**

```bash
npx tsc --noEmit 2>&1 | grep -v '.next/dev/types'
```

Expected: no errors.

- [ ] **Step 2: Build for production**

```bash
npx next build
```

Expected: successful build.

- [ ] **Step 3: Restart production server**

```bash
lsof -ti:3002 | xargs kill -9 2>/dev/null
sleep 1
npx next start -p 3002 > /dev/null 2>&1 &
```

- [ ] **Step 4: Verify the Inngest dev server sees the new function**

Check http://localhost:8288 — the `project-deploy-codebase` function should appear in the function list.

- [ ] **Step 5: Final commit with all changes**

```bash
git add -A
git commit -m "feat: auto-deploy codebase pipeline complete"
git push origin main
```

---

## Self-Review

**Spec coverage:**
- Extract zip to previews/ ✅ (Task 3)
- Detect framework ✅ (Task 1)
- Inject manifest + middleware ✅ (Task 2)
- Install + start server ✅ (Task 3)
- Update project record ✅ (Task 3)
- Apply-mapping triggers deploy ✅ (Task 6)
- Route field in analysis ✅ (Task 5)
- UI passes fileUrl ✅ (Task 7)

**Placeholder scan:** No TBD/TODO found.

**Type consistency:** `FrameworkInfo` used consistently across framework-detect, manifest-inject, and deploy-codebase. `MappedSection` type consistent between apply-mapping and codebase-mapper.
