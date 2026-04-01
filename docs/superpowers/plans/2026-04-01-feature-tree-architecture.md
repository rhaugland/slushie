# Feature Tree Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace slushie.machine's linear wizard with a feature-tree command center where AI-generated modules snap on/off via manifest toggles.

**Architecture:** Two-panel UI (tree + context pane) managing Projects that contain a self-referencing Feature tree. Each feature is built by AI as an isolated module dropped into a universal base shell. Toggles update a manifest file — no rebuild needed. Meetings feed feature suggestions into the tree.

**Tech Stack:** Next.js 16 (App Router), Prisma/PostgreSQL, Inngest v4, Anthropic SDK, Deepgram SDK, Tailwind CSS v4, SQLite (for generated client projects)

---

## File Structure

### New files to create:
```
prisma/schema.prisma                          — New schema (Project, Feature, FeatureBuild, Meeting, MeetingSuggestion)

src/app/page.tsx                               — Full rewrite: two-panel layout
src/app/api/projects/route.ts                  — GET all, POST create project
src/app/api/projects/[id]/route.ts             — GET one, PATCH update, DELETE
src/app/api/projects/[id]/features/route.ts    — GET tree, POST add feature
src/app/api/features/[id]/route.ts             — PATCH update, DELETE
src/app/api/features/[id]/build/route.ts       — POST trigger build
src/app/api/features/[id]/toggle/route.ts      — POST toggle on/off
src/app/api/projects/[id]/meetings/route.ts    — GET all, POST upload
src/app/api/suggestions/[id]/route.ts          — PATCH accept/dismiss

src/components/project-tree.tsx                — Tree panel with toggles
src/components/tree-node.tsx                   — Single tree node (recursive)
src/components/context-pane.tsx                — Right panel router
src/components/pane-project.tsx                — Project detail view
src/components/pane-feature.tsx                — Feature detail view
src/components/pane-meeting.tsx                — Meeting detail + suggestions
src/components/project-sidebar.tsx             — Project list (replaces client sidebar)
src/components/create-project-form.tsx         — New project form

src/inngest/build-feature.ts                   — Per-feature AI generation pipeline
src/inngest/create-project.ts                  — Copy base shell, start server

src/prompts/feature-builder.ts                 — Module generation prompt
src/lib/manifest.ts                            — Read/write features.json utilities
src/lib/schemas.ts                             — Updated Zod schemas

templates/base-shell/                          — Universal shell template
templates/base-shell/package.json
templates/base-shell/app/layout.tsx
templates/base-shell/app/page.tsx
templates/base-shell/app/features/[...slug]/page.tsx
templates/base-shell/lib/manifest.ts
templates/base-shell/lib/db.ts
templates/base-shell/components/shell.tsx
templates/base-shell/components/sidebar-nav.tsx
templates/base-shell/components/ui/button.tsx
templates/base-shell/components/ui/card.tsx
templates/base-shell/components/ui/input.tsx
templates/base-shell/components/ui/table.tsx
templates/base-shell/components/ui/modal.tsx
templates/base-shell/features.json
templates/base-shell/tailwind.config.ts
templates/base-shell/postcss.config.js
templates/base-shell/tsconfig.json
templates/base-shell/next.config.js
```

### Files to delete (after migration):
```
src/components/sidebar.tsx
src/components/client-header.tsx
src/components/progress-stepper.tsx
src/components/step-upload.tsx
src/components/step-objectives.tsx
src/components/step-architect.tsx
src/components/step-build.tsx
src/components/step-deploy.tsx
src/components/objective-card.tsx
src/components/transcript-viewer.tsx

src/app/api/clients/route.ts
src/app/api/meetings/route.ts
src/app/api/meetings/[id]/route.ts
src/app/api/objectives/[id]/route.ts
src/app/api/builds/[id]/route.ts
src/app/api/builds/[id]/approve/route.ts
src/app/api/progress/[entityType]/[entityId]/route.ts

src/inngest/architect.ts
src/inngest/build.ts
src/inngest/deploy.ts
src/inngest/extract-objectives.ts

src/prompts/architect.ts
src/prompts/builder.ts
```

---

## Task 1: Database Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: migration via `npx prisma migrate dev`

- [ ] **Step 1: Replace schema with new models**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model Project {
  id           String    @id @default(cuid())
  name         String
  clientName   String
  clientFirm   String    // "w3" | "isotropic"
  themeConfig  Json      @default("{}")
  baseVersion  String    @default("1.0.0")
  manifestJson Json      @default("{\"features\":[]}")
  deployUrl    String?
  deployStatus String    @default("stopped") // stopped | starting | running | error
  port         Int?
  createdAt    DateTime  @default(now())
  features     Feature[]
  meetings     Meeting[]
}

model Feature {
  id          String         @id @default(cuid())
  projectId   String
  parentId    String?
  title       String
  description String         @db.Text
  enabled     Boolean        @default(false)
  sortOrder   Int            @default(0)
  status      String         @default("draft") // draft | building | live | error
  moduleHash  String?
  createdAt   DateTime       @default(now())
  project     Project        @relation(fields: [projectId], references: [id], onDelete: Cascade)
  parent      Feature?       @relation("FeatureTree", fields: [parentId], references: [id], onDelete: Cascade)
  children    Feature[]      @relation("FeatureTree")
  builds      FeatureBuild[]

  @@index([projectId])
  @@index([parentId])
}

model FeatureBuild {
  id            String   @id @default(cuid())
  featureId     String
  generatedCode Json
  buildLogs     String?  @db.Text
  status        String   @default("queued") // queued | generating | complete | failed
  createdAt     DateTime @default(now())
  feature       Feature  @relation(fields: [featureId], references: [id], onDelete: Cascade)

  @@index([featureId])
}

model Meeting {
  id          String              @id @default(cuid())
  projectId   String
  audioUrl    String
  transcript  String?             @db.Text
  status      String              @default("uploading") // uploading | transcribing | extracting | ready | failed
  createdAt   DateTime            @default(now())
  project     Project             @relation(fields: [projectId], references: [id], onDelete: Cascade)
  suggestions MeetingSuggestion[]

  @@index([projectId])
}

model MeetingSuggestion {
  id                   String   @id @default(cuid())
  meetingId            String
  suggestedTitle       String
  suggestedDescription String   @db.Text
  suggestedPriority    String?  // high | medium | low
  suggestedParentTitle String?
  status               String   @default("pending") // pending | accepted | dismissed
  featureId            String?
  createdAt            DateTime @default(now())
  meeting              Meeting  @relation(fields: [meetingId], references: [id], onDelete: Cascade)

  @@index([meetingId])
}
```

- [ ] **Step 2: Run migration**

```bash
cd /Users/ryanhaugland/slushie-machine
npx prisma migrate dev --name feature-tree-remodel
```

Expected: Migration creates new tables, drops old tables (Client, Objective, Build replaced by Project, Feature, FeatureBuild).

- [ ] **Step 3: Verify schema**

```bash
npx prisma generate
```

Expected: Prisma client regenerated with new types.

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: new schema for feature-tree architecture

Replaces Client/Objective/Build with Project/Feature/FeatureBuild.
Adds MeetingSuggestion as staging area between meetings and feature tree.
Features use self-referencing parentId for tree hierarchy."
```

---

## Task 2: Base Shell Template

**Files:**
- Create: all files under `templates/base-shell/`

This is the universal scaffold copied for every new client project. It's a Next.js 14 app (pinned for stability in generated projects) with a manifest-driven sidebar and dynamic feature mounting.

- [ ] **Step 1: Create package.json**

```json
// templates/base-shell/package.json
{
  "name": "client-project",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "14.2.3",
    "react": "^18",
    "react-dom": "^18",
    "better-sqlite3": "^11.0.0",
    "lucide-react": "^0.400.0",
    "clsx": "^2.1.1"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "@types/better-sqlite3": "^7",
    "tailwindcss": "3.4.3",
    "postcss": "^8",
    "autoprefixer": "^10"
  }
}
```

- [ ] **Step 2: Create config files**

```json
// templates/base-shell/tsconfig.json
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

```javascript
// templates/base-shell/next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {};
module.exports = nextConfig;
```

```javascript
// templates/base-shell/postcss.config.js
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

```javascript
// templates/base-shell/tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./features/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "var(--color-primary)",
        "primary-light": "var(--color-primary-light)",
        surface: "var(--color-surface)",
        "surface-hover": "var(--color-surface-hover)",
        border: "var(--color-border)",
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 3: Create manifest and manifest loader**

```json
// templates/base-shell/features.json
{
  "features": []
}
```

```typescript
// templates/base-shell/lib/manifest.ts
import { readFileSync } from "fs";
import path from "path";

export type ManifestFeature = {
  id: string;
  title: string;
  enabled: boolean;
  route: string;
  navIcon: string;
  children: ManifestFeature[];
};

export type Manifest = {
  features: ManifestFeature[];
};

export function readManifest(): Manifest {
  const raw = readFileSync(
    path.join(process.cwd(), "features.json"),
    "utf-8"
  );
  return JSON.parse(raw);
}

export function getEnabledFeatures(manifest: Manifest): ManifestFeature[] {
  return manifest.features
    .filter((f) => f.enabled)
    .map((f) => ({
      ...f,
      children: f.children.filter((c) => c.enabled),
    }));
}

export function flattenRoutes(
  features: ManifestFeature[]
): { route: string; id: string }[] {
  const routes: { route: string; id: string }[] = [];
  for (const f of features) {
    if (f.enabled) {
      routes.push({ route: f.route, id: f.id });
      for (const c of f.children) {
        if (c.enabled) {
          routes.push({ route: c.route, id: c.id });
        }
      }
    }
  }
  return routes;
}
```

- [ ] **Step 4: Create database helper**

```typescript
// templates/base-shell/lib/db.ts
import Database from "better-sqlite3";
import path from "path";
import { readdirSync, readFileSync, existsSync } from "fs";

const DB_PATH = path.join(process.cwd(), "data.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return db;
}

export function runMigrations(): void {
  const featuresDir = path.join(process.cwd(), "features");
  if (!existsSync(featuresDir)) return;

  const database = getDb();
  const dirs = readdirSync(featuresDir, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const dir of dirs) {
    const schemaPath = path.join(featuresDir, dir.name, "schema.sql");
    if (existsSync(schemaPath)) {
      const sql = readFileSync(schemaPath, "utf-8");
      database.exec(sql);
    }
  }
}
```

- [ ] **Step 5: Create layout and app shell**

```typescript
// templates/base-shell/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { Shell } from "@/components/shell";

export const metadata: Metadata = { title: "Client Project" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
```

```css
/* templates/base-shell/app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-primary: #3b82f6;
  --color-primary-light: #60a5fa;
  --color-surface: #f8fafc;
  --color-surface-hover: #f1f5f9;
  --color-border: #e2e8f0;
  --color-bg: #ffffff;
  --color-text: #0f172a;
  --color-text-muted: #64748b;
}

body {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: system-ui, -apple-system, sans-serif;
}
```

```typescript
// templates/base-shell/app/page.tsx
export default function Home() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-gray-800 mb-2">
          Welcome
        </h1>
        <p className="text-gray-500">
          Select a feature from the sidebar to get started.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create shell and sidebar components**

```typescript
// templates/base-shell/components/shell.tsx
"use client";

import { SidebarNav } from "./sidebar-nav";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <SidebarNav />
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
```

```typescript
// templates/base-shell/components/sidebar-nav.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavFeature = {
  id: string;
  title: string;
  route: string;
  enabled: boolean;
  children: NavFeature[];
};

export function SidebarNav() {
  const [features, setFeatures] = useState<NavFeature[]>([]);
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/manifest")
      .then((r) => r.json())
      .then((data) => setFeatures(data.features || []));
  }, []);

  const enabledFeatures = features.filter((f) => f.enabled);

  return (
    <nav className="w-56 border-r border-gray-200 bg-gray-50 p-4 min-h-screen">
      <div className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Features
      </div>
      <ul className="space-y-1">
        {enabledFeatures.map((f) => (
          <li key={f.id}>
            <Link
              href={f.route}
              className={`block px-3 py-2 rounded-md text-sm ${
                pathname === f.route
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {f.title}
            </Link>
            {f.children.filter((c) => c.enabled).length > 0 && (
              <ul className="ml-4 mt-1 space-y-1">
                {f.children
                  .filter((c) => c.enabled)
                  .map((c) => (
                    <li key={c.id}>
                      <Link
                        href={c.route}
                        className={`block px-3 py-1.5 rounded-md text-xs ${
                          pathname === c.route
                            ? "bg-blue-50 text-blue-700 font-medium"
                            : "text-gray-500 hover:bg-gray-100"
                        }`}
                      >
                        {c.title}
                      </Link>
                    </li>
                  ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 7: Create manifest API route for the client app**

```typescript
// templates/base-shell/app/api/manifest/route.ts
import { readManifest, getEnabledFeatures } from "@/lib/manifest";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const manifest = readManifest();
  return NextResponse.json({ features: getEnabledFeatures(manifest) });
}
```

- [ ] **Step 8: Create dynamic feature page loader**

```typescript
// templates/base-shell/app/features/[...slug]/page.tsx
import { readManifest, flattenRoutes } from "@/lib/manifest";
import { existsSync } from "fs";
import path from "path";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function FeaturePage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const route = "/features/" + slug.join("/");
  const manifest = readManifest();
  const routes = flattenRoutes(manifest.features);
  const match = routes.find((r) => r.route === route);

  if (!match) return notFound();

  const modulePath = path.join(process.cwd(), "features", match.id, "page.tsx");
  if (!existsSync(modulePath)) {
    return (
      <div className="p-8 text-center text-gray-400">
        Feature module not yet built.
      </div>
    );
  }

  // Dynamic import of the feature module
  const FeatureModule = (await import(`@/features/${match.id}/page`)).default;
  return <FeatureModule />;
}
```

- [ ] **Step 9: Create basic UI primitives**

```typescript
// templates/base-shell/components/ui/button.tsx
import { clsx } from "clsx";
import { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors",
        size === "sm" && "px-3 py-1.5 text-xs",
        size === "md" && "px-4 py-2 text-sm",
        variant === "primary" &&
          "bg-blue-600 text-white hover:bg-blue-700",
        variant === "secondary" &&
          "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200",
        variant === "ghost" &&
          "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
        className
      )}
      {...props}
    />
  );
}
```

```typescript
// templates/base-shell/components/ui/card.tsx
import { clsx } from "clsx";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        "rounded-lg border border-gray-200 bg-white p-4",
        className
      )}
    >
      {children}
    </div>
  );
}
```

```typescript
// templates/base-shell/components/ui/input.tsx
import { clsx } from "clsx";
import { InputHTMLAttributes } from "react";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "w-full rounded-md border border-gray-300 px-3 py-2 text-sm",
        "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500",
        className
      )}
      {...props}
    />
  );
}
```

```typescript
// templates/base-shell/components/ui/table.tsx
export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        {children}
      </table>
    </div>
  );
}

export function Thead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-gray-50">{children}</thead>;
}

export function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
      {children}
    </th>
  );
}

export function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 whitespace-nowrap">{children}</td>;
}
```

```typescript
// templates/base-shell/components/ui/modal.tsx
"use client";

import { useEffect, useRef } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
};

export function Modal({ open, onClose, title, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="rounded-xl border border-gray-200 bg-white p-6 shadow-xl backdrop:bg-black/30 max-w-md w-full"
    >
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      {children}
    </dialog>
  );
}
```

- [ ] **Step 10: Commit**

```bash
git add templates/
git commit -m "feat: add universal base shell template

Next.js 14 scaffold with manifest-driven sidebar, dynamic feature
mounting, SQLite database, and shared UI primitives. Copied per
project — never AI-generated."
```

---

## Task 3: Manifest Utilities (slushie-machine side)

**Files:**
- Create: `src/lib/manifest.ts`
- Modify: `src/lib/schemas.ts`

- [ ] **Step 1: Create manifest read/write utilities**

```typescript
// src/lib/manifest.ts
import { readFile, writeFile } from "fs/promises";
import path from "path";

export type ManifestFeature = {
  id: string;
  title: string;
  enabled: boolean;
  route: string;
  navIcon: string;
  children: ManifestFeature[];
};

export type Manifest = {
  features: ManifestFeature[];
};

export async function readManifest(projectDir: string): Promise<Manifest> {
  const raw = await readFile(
    path.join(projectDir, "features.json"),
    "utf-8"
  );
  return JSON.parse(raw);
}

export async function writeManifest(
  projectDir: string,
  manifest: Manifest
): Promise<void> {
  await writeFile(
    path.join(projectDir, "features.json"),
    JSON.stringify(manifest, null, 2)
  );
}

export function addFeatureToManifest(
  manifest: Manifest,
  feature: { id: string; title: string; route: string; parentId: string | null }
): Manifest {
  const node: ManifestFeature = {
    id: feature.id,
    title: feature.title,
    enabled: true,
    route: feature.route,
    navIcon: "Box",
    children: [],
  };

  if (!feature.parentId) {
    return { features: [...manifest.features, node] };
  }

  return {
    features: manifest.features.map((f) =>
      f.id === feature.parentId
        ? { ...f, children: [...f.children, node] }
        : f
    ),
  };
}

export function toggleFeatureInManifest(
  manifest: Manifest,
  featureId: string,
  enabled: boolean
): Manifest {
  return {
    features: manifest.features.map((f) => {
      if (f.id === featureId) {
        return { ...f, enabled };
      }
      return {
        ...f,
        children: f.children.map((c) =>
          c.id === featureId ? { ...c, enabled } : c
        ),
      };
    }),
  };
}

export function removeFeatureFromManifest(
  manifest: Manifest,
  featureId: string
): Manifest {
  return {
    features: manifest.features
      .filter((f) => f.id !== featureId)
      .map((f) => ({
        ...f,
        children: f.children.filter((c) => c.id !== featureId),
      })),
  };
}
```

- [ ] **Step 2: Update schemas.ts with new Zod schemas**

```typescript
// src/lib/schemas.ts
import { z } from "zod";

export const featureModuleSchema = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      content: z.string(),
    })
  ),
});

export const meetingSuggestionsSchema = z.object({
  suggestions: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      priority: z.enum(["high", "medium", "low"]),
      isMajor: z.boolean(),
      suggestedParent: z.string().nullable(),
    })
  ),
});

export type FeatureModuleOutput = z.infer<typeof featureModuleSchema>;
export type MeetingSuggestionsOutput = z.infer<typeof meetingSuggestionsSchema>;
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/manifest.ts src/lib/schemas.ts
git commit -m "feat: manifest utilities and updated schemas

Read/write/toggle/add/remove features in manifest JSON.
New Zod schemas for feature module output and meeting suggestions."
```

---

## Task 4: API Routes — Projects

**Files:**
- Create: `src/app/api/projects/route.ts`
- Create: `src/app/api/projects/[id]/route.ts`

- [ ] **Step 1: Create projects list and create route**

```typescript
// src/app/api/projects/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const projects = await prisma.project.findMany({
    include: {
      features: {
        include: { children: true, builds: { take: 1, orderBy: { createdAt: "desc" } } },
        where: { parentId: null },
        orderBy: { sortOrder: "asc" },
      },
      meetings: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, clientName, clientFirm } = body;

  if (!name || !clientName || !clientFirm) {
    return NextResponse.json({ error: "name, clientName, clientFirm required" }, { status: 400 });
  }
  if (!["w3", "isotropic"].includes(clientFirm)) {
    return NextResponse.json({ error: "clientFirm must be w3 or isotropic" }, { status: 400 });
  }

  const project = await prisma.project.create({
    data: { name, clientName, clientFirm },
  });

  // Trigger project setup (copy base shell, start server)
  const { inngest } = await import("@/inngest/client");
  await inngest.send({ name: "project/create", data: { projectId: project.id } });

  return NextResponse.json(project, { status: 201 });
}
```

- [ ] **Step 2: Create single project route**

```typescript
// src/app/api/projects/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      features: {
        include: {
          children: {
            include: { builds: { take: 1, orderBy: { createdAt: "desc" } } },
            orderBy: { sortOrder: "asc" },
          },
          builds: { take: 1, orderBy: { createdAt: "desc" } },
        },
        where: { parentId: null },
        orderBy: { sortOrder: "asc" },
      },
      meetings: {
        include: { suggestions: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const allowed = ["name", "clientName", "clientFirm", "themeConfig"];
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  const project = await prisma.project.update({ where: { id }, data });
  return NextResponse.json(project);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.project.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/projects/
git commit -m "feat: project CRUD API routes

GET/POST /api/projects, GET/PATCH/DELETE /api/projects/[id].
POST triggers project/create Inngest event for shell setup."
```

---

## Task 5: API Routes — Features

**Files:**
- Create: `src/app/api/projects/[id]/features/route.ts`
- Create: `src/app/api/features/[id]/route.ts`
- Create: `src/app/api/features/[id]/build/route.ts`
- Create: `src/app/api/features/[id]/toggle/route.ts`

- [ ] **Step 1: Create feature list and add route**

```typescript
// src/app/api/projects/[id]/features/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const features = await prisma.feature.findMany({
    where: { projectId: id, parentId: null },
    include: {
      children: {
        include: { builds: { take: 1, orderBy: { createdAt: "desc" } } },
        orderBy: { sortOrder: "asc" },
      },
      builds: { take: 1, orderBy: { createdAt: "desc" } },
    },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json(features);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { title, description, parentId } = body;

  if (!title || !description) {
    return NextResponse.json({ error: "title and description required" }, { status: 400 });
  }

  // Get next sort order
  const count = await prisma.feature.count({
    where: { projectId: id, parentId: parentId || null },
  });

  const feature = await prisma.feature.create({
    data: {
      projectId: id,
      parentId: parentId || null,
      title,
      description,
      sortOrder: count,
    },
  });

  return NextResponse.json(feature, { status: 201 });
}
```

- [ ] **Step 2: Create single feature route**

```typescript
// src/app/api/features/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readManifest, writeManifest, removeFeatureFromManifest } from "@/lib/manifest";
import path from "path";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const allowed = ["title", "description", "sortOrder"];
  const data: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  const feature = await prisma.feature.update({ where: { id }, data });
  return NextResponse.json(feature);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const feature = await prisma.feature.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });

  // Remove from manifest if project is deployed
  if (feature.project.deployUrl) {
    const slug = feature.project.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const projectDir = path.join(process.cwd(), "previews", slug);
    try {
      const manifest = await readManifest(projectDir);
      const updated = removeFeatureFromManifest(manifest, id);
      await writeManifest(projectDir, updated);
    } catch { /* project dir may not exist yet */ }
  }

  await prisma.feature.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Create toggle route**

```typescript
// src/app/api/features/[id]/toggle/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readManifest, writeManifest, toggleFeatureInManifest } from "@/lib/manifest";
import path from "path";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { enabled } = body;

  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) required" }, { status: 400 });
  }

  const feature = await prisma.feature.update({
    where: { id },
    data: { enabled },
    include: { project: true },
  });

  // Update manifest on disk
  const slug = feature.project.name.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const projectDir = path.join(process.cwd(), "previews", slug);
  try {
    const manifest = await readManifest(projectDir);
    const updated = toggleFeatureInManifest(manifest, id, enabled);
    await writeManifest(projectDir, updated);
  } catch { /* project dir may not exist yet */ }

  // Update project's manifestJson in DB
  try {
    const manifest = await readManifest(projectDir);
    await prisma.project.update({
      where: { id: feature.projectId },
      data: { manifestJson: manifest as object },
    });
  } catch { /* ignore */ }

  return NextResponse.json(feature);
}
```

- [ ] **Step 4: Create build trigger route**

```typescript
// src/app/api/features/[id]/build/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const feature = await prisma.feature.findUniqueOrThrow({
    where: { id },
    include: { project: true },
  });

  if (feature.status === "building") {
    return NextResponse.json({ error: "Already building" }, { status: 409 });
  }

  // Create build record
  const build = await prisma.featureBuild.create({
    data: {
      featureId: id,
      generatedCode: {},
      status: "queued",
    },
  });

  // Update feature status
  await prisma.feature.update({
    where: { id },
    data: { status: "building" },
  });

  // Trigger Inngest
  const { inngest } = await import("@/inngest/client");
  await inngest.send({
    name: "feature/build",
    data: { buildId: build.id, featureId: id, projectId: feature.projectId },
  });

  return NextResponse.json(build, { status: 201 });
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/features/ src/app/api/projects/
git commit -m "feat: feature API routes — CRUD, toggle, build trigger

POST /projects/[id]/features to add features.
PATCH/DELETE /features/[id] for editing.
POST /features/[id]/toggle for manifest toggles.
POST /features/[id]/build to trigger AI generation."
```

---

## Task 6: API Routes — Meetings & Suggestions

**Files:**
- Create: `src/app/api/projects/[id]/meetings/route.ts`
- Create: `src/app/api/suggestions/[id]/route.ts`
- Modify: `src/app/api/upload/route.ts` (keep as-is, still works)

- [ ] **Step 1: Create meetings route**

```typescript
// src/app/api/projects/[id]/meetings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const meetings = await prisma.meeting.findMany({
    where: { projectId: id },
    include: { suggestions: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(meetings);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { audioUrl } = body;

  if (!audioUrl) {
    return NextResponse.json({ error: "audioUrl required" }, { status: 400 });
  }

  const meeting = await prisma.meeting.create({
    data: { projectId: id, audioUrl },
  });

  const { inngest } = await import("@/inngest/client");
  await inngest.send({
    name: "meeting/transcribe",
    data: { meetingId: meeting.id },
  });

  return NextResponse.json(meeting, { status: 201 });
}
```

- [ ] **Step 2: Create suggestion accept/dismiss route**

```typescript
// src/app/api/suggestions/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const { status, parentId } = body;

  if (!["accepted", "dismissed"].includes(status)) {
    return NextResponse.json({ error: "status must be accepted or dismissed" }, { status: 400 });
  }

  if (status === "dismissed") {
    const suggestion = await prisma.meetingSuggestion.update({
      where: { id },
      data: { status: "dismissed" },
    });
    return NextResponse.json(suggestion);
  }

  // Accept: create feature from suggestion
  const suggestion = await prisma.meetingSuggestion.findUniqueOrThrow({
    where: { id },
    include: { meeting: true },
  });

  const count = await prisma.feature.count({
    where: { projectId: suggestion.meeting.projectId, parentId: parentId || null },
  });

  const feature = await prisma.feature.create({
    data: {
      projectId: suggestion.meeting.projectId,
      parentId: parentId || null,
      title: suggestion.suggestedTitle,
      description: suggestion.suggestedDescription,
      sortOrder: count,
    },
  });

  await prisma.meetingSuggestion.update({
    where: { id },
    data: { status: "accepted", featureId: feature.id },
  });

  return NextResponse.json({ suggestion, feature });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/projects/ src/app/api/suggestions/
git commit -m "feat: meeting and suggestion API routes

POST /projects/[id]/meetings to upload and trigger transcription.
PATCH /suggestions/[id] to accept (creates feature) or dismiss."
```

---

## Task 7: Inngest — Project Creation

**Files:**
- Create: `src/inngest/create-project.ts`
- Modify: `src/inngest/index.ts` (or wherever functions are registered)

- [ ] **Step 1: Create project setup function**

```typescript
// src/inngest/create-project.ts
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
```

- [ ] **Step 2: Commit**

```bash
git add src/inngest/create-project.ts
git commit -m "feat: Inngest function to create project

Copies base shell template, npm installs, starts dev server on
dynamic port. Updates project with deployUrl and running status."
```

---

## Task 8: Inngest — Feature Build Pipeline

**Files:**
- Create: `src/inngest/build-feature.ts`
- Create: `src/prompts/feature-builder.ts`

- [ ] **Step 1: Create feature builder prompt**

```typescript
// src/prompts/feature-builder.ts
export function featureBuilderPrompt(context: {
  title: string;
  description: string;
  existingTables: string;
  siblingFeatures: { title: string; tables: string }[];
  themeVars: string;
}): { system: string; user: string } {
  const siblingContext = context.siblingFeatures.length > 0
    ? `\nOther enabled features (for shared DB context, do NOT import their code):\n${context.siblingFeatures
        .map((f) => `- ${f.title}: tables: ${f.tables}`)
        .join("\n")}`
    : "";

  return {
    system: `You are a feature module builder. You generate self-contained Next.js feature modules.

Each module is a directory that gets placed at /features/{featureId}/ in a Next.js app.

REQUIRED files:
- page.tsx — the main page component (default export, "use client" if interactive)
- schema.sql — SQLite CREATE TABLE IF NOT EXISTS statements for any data this feature needs

OPTIONAL files:
- components/*.tsx — sub-components
- api/route.ts — API routes (will be mounted at /api/features/{featureId}/*)

Rules:
- Use "use client" directive for interactive components
- Import shared UI from @/components/ui (Button, Card, Input, Table/Thead/Th/Td, Modal)
- For database access, import { getDb } from "@/lib/db"
- Use CSS variables for theme colors: var(--color-primary), var(--color-text), var(--color-surface), etc.
- NEVER import from other feature modules
- You CAN read other features' database tables directly via SQL
- Use Tailwind CSS classes for styling
- Keep it compact — working MVP only
- All SQL must use CREATE TABLE IF NOT EXISTS and ALTER TABLE ADD COLUMN IF NOT EXISTS patterns

Respond with ONLY valid JSON (no markdown, no explanation):
{"files":[{"path":"page.tsx","content":"..."},{"path":"schema.sql","content":"..."}]}`,

    user: `Feature: ${context.title}
Description: ${context.description}

Current database schema:
${context.existingTables || "No tables yet."}
${siblingContext}

Build this feature module.`,
  };
}
```

- [ ] **Step 2: Create feature build Inngest function**

```typescript
// src/inngest/build-feature.ts
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

      // Get existing DB schema from project's SQLite
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

      // Determine route
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

      // Update DB records
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
```

- [ ] **Step 3: Commit**

```bash
git add src/inngest/build-feature.ts src/prompts/feature-builder.ts
git commit -m "feat: per-feature AI build pipeline

Single Inngest function that prepares context, calls Claude to generate
a module, writes files to the project's features/ directory, runs
SQLite migrations, and updates the manifest. No separate architect step."
```

---

## Task 9: Inngest — Meeting Transcription & Suggestion Extraction

**Files:**
- Modify: `src/inngest/transcribe.ts`
- Create: `src/prompts/suggestion-extractor.ts`
- Modify: `src/inngest/extract-objectives.ts` → rename/rewrite to `src/inngest/extract-suggestions.ts`

- [ ] **Step 1: Update transcribe to use projectId**

The existing transcribe function references `meetingId` and works with the Meeting model. The Meeting model now has `projectId` instead of `clientId`. Update the foreign key reference and the event it triggers after completion.

```typescript
// src/inngest/transcribe.ts
import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { createClient } from "@deepgram/sdk";
import { readFile } from "fs/promises";
import path from "path";

const deepgram = createClient(process.env.DEEPGRAM_API_KEY!);

export const transcribe = inngest.createFunction(
  {
    id: "meeting-transcribe",
    retries: 3,
    triggers: [{ event: "meeting/transcribe" }],
  },
  async ({ event, step }) => {
    const { meetingId } = event.data;

    const meeting = await step.run("load-meeting", async () => {
      const m = await prisma.meeting.update({
        where: { id: meetingId },
        data: { status: "transcribing" },
      });
      return m;
    });

    const transcript = await step.run("transcribe", async () => {
      const audioUrl = meeting.audioUrl;
      let response;

      if (audioUrl.startsWith("/uploads/")) {
        const filePath = path.join(process.cwd(), "public", audioUrl);
        const buffer = await readFile(filePath);
        response = await (deepgram as any).listen.prerecorded.transcribeFile(
          buffer,
          { model: "nova-3", smart_format: true }
        );
      } else {
        response = await (deepgram as any).listen.prerecorded.transcribeUrl(
          { url: audioUrl },
          { model: "nova-3", smart_format: true }
        );
      }

      const text =
        response.result?.results?.channels?.[0]?.alternatives?.[0]?.transcript ??
        "";
      return text;
    });

    await step.run("save-transcript", async () => {
      await prisma.meeting.update({
        where: { id: meetingId },
        data: { transcript, status: "extracting" },
      });
    });

    await step.run("trigger-extraction", async () => {
      await inngest.send({
        name: "meeting/extract-suggestions",
        data: { meetingId },
      });
    });

    return { meetingId };
  }
);
```

- [ ] **Step 2: Create suggestion extractor prompt**

```typescript
// src/prompts/suggestion-extractor.ts
export function suggestionExtractorPrompt(context: {
  transcript: string;
  existingFeatures: { title: string; isMajor: boolean }[];
}): { system: string; user: string } {
  const existingContext = context.existingFeatures.length > 0
    ? `\nExisting features in this project:\n${context.existingFeatures
        .map((f) => `- ${f.title} (${f.isMajor ? "major" : "minor"})`)
        .join("\n")}\n\nDo NOT suggest features that already exist. If the client discusses changes to existing features, suggest them as minor features under the relevant major feature.`
    : "";

  return {
    system: `You extract feature suggestions from client meeting transcripts.

For each distinct feature or capability the client mentions, create a suggestion with:
- title: Short, clear feature name (e.g., "Contact Management", "CSV Import")
- description: 2-3 sentences explaining what the client wants
- priority: high | medium | low (based on emphasis in the conversation)
- isMajor: true if it's a top-level feature, false if it's a sub-feature of something else
- suggestedParent: if isMajor is false, the title of the major feature it belongs under (must match an existing feature title or another suggestion's title). null if isMajor is true.

Rules:
- Extract 3-8 suggestions max
- Be specific — "Contact Tagging" not "Various contact features"
- Only extract features the client actually discussed, not implied ones
- If the client mentions something that sounds like a sub-feature of an existing feature, mark it as minor with the correct parent

Respond with ONLY valid JSON:
{"suggestions":[{"title":"...","description":"...","priority":"high","isMajor":true,"suggestedParent":null}]}`,

    user: `Transcript:\n${context.transcript}${existingContext}`,
  };
}
```

- [ ] **Step 3: Create extract-suggestions Inngest function**

```typescript
// src/inngest/extract-suggestions.ts
import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { callClaude } from "@/lib/ai";
import { suggestionExtractorPrompt } from "@/prompts/suggestion-extractor";
import { meetingSuggestionsSchema } from "@/lib/schemas";

export const extractSuggestions = inngest.createFunction(
  {
    id: "meeting-extract-suggestions",
    retries: 2,
    triggers: [{ event: "meeting/extract-suggestions" }],
  },
  async ({ event, step }) => {
    const { meetingId } = event.data;

    const context = await step.run("load-context", async () => {
      const meeting = await prisma.meeting.findUniqueOrThrow({
        where: { id: meetingId },
        include: { project: { include: { features: true } } },
      });

      return {
        transcript: meeting.transcript || "",
        projectId: meeting.project.id,
        existingFeatures: meeting.project.features.map((f) => ({
          title: f.title,
          isMajor: f.parentId === null,
        })),
      };
    });

    const suggestions = await step.run("extract", async () => {
      const prompt = suggestionExtractorPrompt({
        transcript: context.transcript,
        existingFeatures: context.existingFeatures,
      });

      const raw = await callClaude({
        systemPrompt: prompt.system,
        userMessage: prompt.user,
        temperature: 0.1,
      });

      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in response");
      return meetingSuggestionsSchema.parse(JSON.parse(jsonMatch[0]));
    });

    await step.run("save-suggestions", async () => {
      for (const s of suggestions.suggestions) {
        await prisma.meetingSuggestion.create({
          data: {
            meetingId,
            suggestedTitle: s.title,
            suggestedDescription: s.description,
            suggestedPriority: s.priority,
            suggestedParentTitle: s.suggestedParent,
            status: "pending",
          },
        });
      }

      await prisma.meeting.update({
        where: { id: meetingId },
        data: { status: "ready" },
      });
    });

    return { meetingId, count: suggestions.suggestions.length };
  }
);
```

- [ ] **Step 4: Commit**

```bash
git add src/inngest/transcribe.ts src/inngest/extract-suggestions.ts src/prompts/suggestion-extractor.ts
git commit -m "feat: meeting transcription and suggestion extraction

Updated transcribe for new Meeting model. New extract-suggestions
function replaces extract-objectives — produces MeetingSuggestion
records that appear in the meeting detail pane for user curation."
```

---

## Task 10: Register Inngest Functions

**Files:**
- Modify: `src/app/api/inngest/route.ts`

- [ ] **Step 1: Update Inngest serve to register new functions**

```typescript
// src/app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { transcribe } from "@/inngest/transcribe";
import { extractSuggestions } from "@/inngest/extract-suggestions";
import { createProject } from "@/inngest/create-project";
import { buildFeature } from "@/inngest/build-feature";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [transcribe, extractSuggestions, createProject, buildFeature],
});
```

- [ ] **Step 2: Delete old Inngest functions**

```bash
rm src/inngest/architect.ts src/inngest/build.ts src/inngest/deploy.ts src/inngest/extract-objectives.ts
rm src/prompts/architect.ts src/prompts/builder.ts src/prompts/objective-parser.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/inngest/route.ts
git add -u src/inngest/ src/prompts/
git commit -m "feat: register new Inngest functions, remove old pipeline

New: createProject, buildFeature, extractSuggestions.
Removed: architect, build, deploy, extract-objectives and their prompts."
```

---

## Task 11: UI — Project Sidebar

**Files:**
- Create: `src/components/project-sidebar.tsx`
- Create: `src/components/create-project-form.tsx`

- [ ] **Step 1: Create project sidebar**

```typescript
// src/components/project-sidebar.tsx
"use client";

import { useState } from "react";
import { CreateProjectForm } from "./create-project-form";

type Project = {
  id: string;
  name: string;
  clientName: string;
  clientFirm: string;
  deployUrl: string | null;
  deployStatus: string;
  features: { id: string; status: string }[];
};

type Props = {
  projects: Project[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onProjectCreated: () => void;
};

export function ProjectSidebar({ projects, selectedId, onSelect, onProjectCreated }: Props) {
  const [showForm, setShowForm] = useState(false);

  const w3 = projects.filter((p) => p.clientFirm === "w3");
  const iso = projects.filter((p) => p.clientFirm === "isotropic");

  function ProjectItem({ project }: { project: Project }) {
    const liveCount = project.features.filter((f) => f.status === "live").length;
    const isSelected = project.id === selectedId;

    return (
      <button
        onClick={() => onSelect(project.id)}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
          isSelected
            ? "bg-blue-500/15 text-blue-300 border border-blue-500/20"
            : "text-white/60 hover:text-white hover:bg-white/[0.05]"
        }`}
      >
        <div className="flex justify-between items-center">
          <span className="truncate">{project.name}</span>
          {liveCount > 0 && (
            <span className="text-[0.6rem] text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
              {liveCount} live
            </span>
          )}
        </div>
        <div className="text-[0.6rem] text-white/30 mt-0.5">{project.clientName}</div>
      </button>
    );
  }

  return (
    <aside className="w-64 border-r border-white/[0.06] bg-[#0a0f1a] p-4 min-h-screen flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-sm font-bold tracking-tight">
          <span className="bg-gradient-to-r from-red-500 to-blue-500 bg-clip-text text-transparent">
            slushie.machine
          </span>
        </h1>
      </div>

      <button
        onClick={() => setShowForm(!showForm)}
        className="w-full mb-4 px-3 py-2 text-xs rounded-lg border border-dashed border-white/10 text-white/40 hover:text-white/60 hover:border-white/20 transition-colors"
      >
        + New project
      </button>

      {showForm && (
        <CreateProjectForm
          onCreated={() => {
            setShowForm(false);
            onProjectCreated();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <div className="flex-1 overflow-y-auto space-y-4">
        {w3.length > 0 && (
          <div>
            <div className="text-[0.6rem] uppercase tracking-widest text-red-400/60 mb-2">w3</div>
            <div className="space-y-1">
              {w3.map((p) => <ProjectItem key={p.id} project={p} />)}
            </div>
          </div>
        )}
        {iso.length > 0 && (
          <div>
            <div className="text-[0.6rem] uppercase tracking-widest text-blue-400/60 mb-2">isotropic</div>
            <div className="space-y-1">
              {iso.map((p) => <ProjectItem key={p.id} project={p} />)}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Create project form**

```typescript
// src/components/create-project-form.tsx
"use client";

import { useState } from "react";

type Props = {
  onCreated: () => void;
  onCancel: () => void;
};

export function CreateProjectForm({ onCreated, onCancel }: Props) {
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [firm, setFirm] = useState<"w3" | "isotropic">("w3");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !clientName.trim()) return;
    setLoading(true);
    await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, clientName, clientFirm: firm }),
    });
    setLoading(false);
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 p-3 rounded-lg bg-white/[0.03] border border-white/[0.08] space-y-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name"
        className="w-full bg-transparent border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20"
      />
      <input
        value={clientName}
        onChange={(e) => setClientName(e.target.value)}
        placeholder="Client name"
        className="w-full bg-transparent border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20"
      />
      <div className="flex gap-2">
        {(["w3", "isotropic"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFirm(f)}
            className={`flex-1 text-[0.6rem] py-1 rounded border transition-colors ${
              firm === f
                ? f === "w3"
                  ? "border-red-500/30 bg-red-500/10 text-red-400"
                  : "border-blue-500/30 bg-blue-500/10 text-blue-400"
                : "border-white/10 text-white/30"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 text-xs py-1.5 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {loading ? "Creating..." : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs py-1.5 px-3 rounded text-white/30 hover:text-white/50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/project-sidebar.tsx src/components/create-project-form.tsx
git commit -m "feat: project sidebar with firm grouping and create form"
```

---

## Task 12: UI — Project Tree Panel

**Files:**
- Create: `src/components/project-tree.tsx`
- Create: `src/components/tree-node.tsx`

- [ ] **Step 1: Create tree node component**

```typescript
// src/components/tree-node.tsx
"use client";

import { useState } from "react";

type Feature = {
  id: string;
  title: string;
  enabled: boolean;
  status: string;
  parentId: string | null;
  children: Feature[];
  builds: { id: string; status: string }[];
};

type Props = {
  feature: Feature;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
};

const STATUS_DOT: Record<string, string> = {
  draft: "bg-white/20",
  building: "bg-yellow-400 animate-pulse",
  live: "bg-green-400",
  error: "bg-red-400",
};

export function TreeNode({ feature, depth, selectedId, onSelect, onToggle }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = feature.children.length > 0;
  const isSelected = feature.id === selectedId;

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors group ${
          isSelected
            ? "bg-blue-500/15 border border-blue-500/20"
            : "hover:bg-white/[0.04] border border-transparent"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(feature.id)}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed(!collapsed);
            }}
            className="text-white/20 hover:text-white/40 text-[0.6rem] w-3"
          >
            {collapsed ? "+" : "-"}
          </button>
        )}
        {!hasChildren && <span className="w-3" />}

        <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[feature.status] || STATUS_DOT.draft}`} />

        <span className={`flex-1 text-xs truncate ${
          feature.enabled ? "text-white/80" : "text-white/30 line-through"
        }`}>
          {feature.title}
        </span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(feature.id, !feature.enabled);
          }}
          className={`w-7 h-4 rounded-full transition-colors flex-shrink-0 ${
            feature.enabled ? "bg-blue-500" : "bg-white/10"
          }`}
        >
          <div
            className={`w-3 h-3 rounded-full bg-white transition-transform ${
              feature.enabled ? "translate-x-3.5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {!collapsed && hasChildren && (
        <div>
          {feature.children.map((child) => (
            <TreeNode
              key={child.id}
              feature={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create project tree panel**

```typescript
// src/components/project-tree.tsx
"use client";

import { useState } from "react";
import { TreeNode } from "./tree-node";

type Feature = {
  id: string;
  title: string;
  enabled: boolean;
  status: string;
  parentId: string | null;
  children: Feature[];
  builds: { id: string; status: string }[];
};

type Meeting = {
  id: string;
  status: string;
  createdAt: string;
  suggestions: { id: string; status: string }[];
};

type Project = {
  id: string;
  name: string;
  deployUrl: string | null;
  deployStatus: string;
  features: Feature[];
  meetings: Meeting[];
};

type Selection =
  | { type: "project" }
  | { type: "feature"; id: string }
  | { type: "meeting"; id: string };

type Props = {
  project: Project;
  selection: Selection;
  onSelect: (sel: Selection) => void;
  onToggle: (featureId: string, enabled: boolean) => void;
  onAddFeature: (parentId: string | null) => void;
};

export function ProjectTree({ project, selection, onSelect, onToggle, onAddFeature }: Props) {
  const [meetingsOpen, setMeetingsOpen] = useState(false);

  const pendingSuggestions = project.meetings.reduce(
    (sum, m) => sum + m.suggestions.filter((s) => s.status === "pending").length,
    0
  );

  return (
    <div className="w-72 border-r border-white/[0.06] bg-[#0c1120] p-3 min-h-screen flex flex-col overflow-y-auto">
      {/* Project header */}
      <button
        onClick={() => onSelect({ type: "project" })}
        className={`w-full text-left px-3 py-2 rounded-lg mb-3 transition-colors ${
          selection.type === "project"
            ? "bg-white/[0.06] border border-white/[0.1]"
            : "hover:bg-white/[0.03] border border-transparent"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white/90">{project.name}</span>
          {project.deployUrl && (
            <a
              href={project.deployUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[0.6rem] text-blue-400 hover:text-blue-300"
            >
              Preview
            </a>
          )}
        </div>
        <div className={`text-[0.55rem] mt-0.5 ${
          project.deployStatus === "running" ? "text-green-400" : "text-white/30"
        }`}>
          {project.deployStatus}
        </div>
      </button>

      {/* Feature tree */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-[0.6rem] uppercase tracking-widest text-white/30">Features</div>
        <button
          onClick={() => onAddFeature(null)}
          className="text-[0.6rem] text-white/20 hover:text-white/40 transition-colors"
        >
          +
        </button>
      </div>

      <div className="space-y-0.5 mb-4">
        {project.features.map((f) => (
          <TreeNode
            key={f.id}
            feature={f}
            depth={0}
            selectedId={selection.type === "feature" ? selection.id : null}
            onSelect={(id) => onSelect({ type: "feature", id })}
            onToggle={onToggle}
          />
        ))}
        {project.features.length === 0 && (
          <p className="text-[0.65rem] text-white/20 px-2 py-4 text-center">
            No features yet. Add one above or upload a meeting.
          </p>
        )}
      </div>

      {/* Meetings section */}
      <div className="mt-auto pt-4 border-t border-white/[0.06]">
        <button
          onClick={() => setMeetingsOpen(!meetingsOpen)}
          className="flex items-center justify-between w-full mb-2"
        >
          <div className="text-[0.6rem] uppercase tracking-widest text-white/30 flex items-center gap-2">
            Meetings
            {pendingSuggestions > 0 && (
              <span className="text-[0.55rem] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">
                {pendingSuggestions}
              </span>
            )}
          </div>
          <span className="text-white/20 text-[0.6rem]">{meetingsOpen ? "-" : "+"}</span>
        </button>

        {meetingsOpen && (
          <div className="space-y-1">
            {project.meetings.map((m) => {
              const date = new Date(m.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              });
              const pending = m.suggestions.filter((s) => s.status === "pending").length;

              return (
                <button
                  key={m.id}
                  onClick={() => onSelect({ type: "meeting", id: m.id })}
                  className={`w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors ${
                    selection.type === "meeting" && selection.id === m.id
                      ? "bg-blue-500/15 text-blue-300"
                      : "text-white/40 hover:text-white/60 hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex justify-between">
                    <span>{date}</span>
                    <span className={`text-[0.55rem] ${
                      m.status === "ready" ? "text-green-400" : "text-yellow-400"
                    }`}>
                      {m.status}
                    </span>
                  </div>
                  {pending > 0 && (
                    <span className="text-[0.55rem] text-blue-400">{pending} suggestions</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/project-tree.tsx src/components/tree-node.tsx
git commit -m "feat: project tree panel with recursive nodes and toggles

Collapsible tree with toggle switches, status dots, and meeting
section with pending suggestion badges."
```

---

## Task 13: UI — Context Pane

**Files:**
- Create: `src/components/context-pane.tsx`
- Create: `src/components/pane-project.tsx`
- Create: `src/components/pane-feature.tsx`
- Create: `src/components/pane-meeting.tsx`

- [ ] **Step 1: Create context pane router**

```typescript
// src/components/context-pane.tsx
"use client";

import { PaneProject } from "./pane-project";
import { PaneFeature } from "./pane-feature";
import { PaneMeeting } from "./pane-meeting";

type Selection =
  | { type: "project" }
  | { type: "feature"; id: string }
  | { type: "meeting"; id: string };

type Props = {
  project: any;
  selection: Selection;
  onUpdate: () => void;
};

export function ContextPane({ project, selection, onUpdate }: Props) {
  if (selection.type === "project") {
    return <PaneProject project={project} onUpdate={onUpdate} />;
  }

  if (selection.type === "feature") {
    const allFeatures = [
      ...project.features,
      ...project.features.flatMap((f: any) => f.children || []),
    ];
    const feature = allFeatures.find((f: any) => f.id === selection.id);
    if (!feature) return <p className="text-white/30 text-sm">Feature not found.</p>;
    return <PaneFeature feature={feature} projectId={project.id} onUpdate={onUpdate} />;
  }

  if (selection.type === "meeting") {
    const meeting = project.meetings.find((m: any) => m.id === selection.id);
    if (!meeting) return <p className="text-white/30 text-sm">Meeting not found.</p>;
    return (
      <PaneMeeting
        meeting={meeting}
        projectId={project.id}
        existingFeatures={project.features}
        onUpdate={onUpdate}
      />
    );
  }

  return null;
}
```

- [ ] **Step 2: Create project pane**

```typescript
// src/components/pane-project.tsx
"use client";

type Props = {
  project: {
    id: string;
    name: string;
    clientName: string;
    clientFirm: string;
    deployUrl: string | null;
    deployStatus: string;
    features: any[];
  };
  onUpdate: () => void;
};

export function PaneProject({ project }: Props) {
  const liveFeatures = [
    ...project.features,
    ...project.features.flatMap((f: any) => f.children || []),
  ].filter((f) => f.status === "live");

  const totalFeatures = [
    ...project.features,
    ...project.features.flatMap((f: any) => f.children || []),
  ].length;

  return (
    <div>
      <h2 className="text-xl font-semibold text-[#f1f5f9] mb-1">{project.name}</h2>
      <p className="text-xs text-white/40 mb-6">
        {project.clientName} · {project.clientFirm}
      </p>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.08]">
          <div className="text-lg font-semibold text-white/80">{totalFeatures}</div>
          <div className="text-[0.6rem] text-white/30 uppercase tracking-wider">Features</div>
        </div>
        <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.08]">
          <div className="text-lg font-semibold text-green-400">{liveFeatures.length}</div>
          <div className="text-[0.6rem] text-white/30 uppercase tracking-wider">Live</div>
        </div>
        <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.08]">
          <div className={`text-lg font-semibold ${
            project.deployStatus === "running" ? "text-green-400" : "text-white/40"
          }`}>
            {project.deployStatus === "running" ? "Up" : project.deployStatus}
          </div>
          <div className="text-[0.6rem] text-white/30 uppercase tracking-wider">Server</div>
        </div>
      </div>

      {/* Preview URL */}
      {project.deployUrl && (
        <div className="bg-white/[0.03] rounded-lg p-4 border border-white/[0.08] mb-4">
          <div className="text-[0.6rem] text-white/30 uppercase tracking-wider mb-2">Preview URL</div>
          <a
            href={project.deployUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-400 hover:text-blue-300 underline break-all"
          >
            {project.deployUrl}
          </a>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create feature pane**

```typescript
// src/components/pane-feature.tsx
"use client";

import { useState } from "react";

type Props = {
  feature: {
    id: string;
    title: string;
    description: string;
    enabled: boolean;
    status: string;
    children?: any[];
    builds: { id: string; status: string; buildLogs: string | null; createdAt: string }[];
  };
  projectId: string;
  onUpdate: () => void;
};

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  draft: { text: "Ready to build", color: "text-white/40 bg-white/[0.06]" },
  building: { text: "Building...", color: "text-yellow-400 bg-yellow-500/10" },
  live: { text: "Live", color: "text-green-400 bg-green-500/10" },
  error: { text: "Error", color: "text-red-400 bg-red-500/10" },
};

export function PaneFeature({ feature, projectId, onUpdate }: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(feature.title);
  const [description, setDescription] = useState(feature.description);
  const [building, setBuilding] = useState(false);

  const statusInfo = STATUS_LABEL[feature.status] || STATUS_LABEL.draft;
  const latestBuild = feature.builds[0] || null;

  let buildProgress: { step: number; total: number; message: string } | null = null;
  if (latestBuild?.buildLogs) {
    try {
      buildProgress = JSON.parse(latestBuild.buildLogs);
    } catch { /* ignore */ }
  }

  async function handleSave() {
    await fetch(`/api/features/${feature.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description }),
    });
    setEditing(false);
    onUpdate();
  }

  async function handleBuild() {
    setBuilding(true);
    await fetch(`/api/features/${feature.id}/build`, { method: "POST" });
    setBuilding(false);
    onUpdate();
  }

  async function handleDelete() {
    await fetch(`/api/features/${feature.id}`, { method: "DELETE" });
    onUpdate();
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          {editing ? (
            <div className="space-y-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-transparent border border-white/10 rounded px-2 py-1 text-lg text-white font-semibold focus:outline-none focus:border-white/20"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full bg-transparent border border-white/10 rounded px-2 py-1 text-sm text-white/60 focus:outline-none focus:border-white/20 resize-none"
              />
              <div className="flex gap-2">
                <button onClick={handleSave} className="text-xs text-blue-400 hover:text-blue-300">Save</button>
                <button onClick={() => setEditing(false)} className="text-xs text-white/30 hover:text-white/50">Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-[#f1f5f9] mb-1">{feature.title}</h2>
              <p className="text-sm text-white/40 mb-3">{feature.description}</p>
            </>
          )}
        </div>
        <span className={`text-[0.6rem] px-2 py-1 rounded-md ${statusInfo.color}`}>
          {statusInfo.text}
        </span>
      </div>

      {/* Build progress */}
      {feature.status === "building" && buildProgress && (
        <div className="bg-white/[0.03] rounded-lg p-4 border border-white/[0.08] mb-4">
          <div className="flex justify-between text-[0.65rem] text-white/40 mb-1.5">
            <span>{buildProgress.message}</span>
            <span>{Math.round((buildProgress.step / buildProgress.total) * 100)}%</span>
          </div>
          <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-red-500 to-blue-500 transition-all duration-700"
              style={{ width: `${Math.round((buildProgress.step / buildProgress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mb-6">
        {(feature.status === "draft" || feature.status === "error") && (
          <button
            onClick={handleBuild}
            disabled={building}
            className="px-4 py-2 text-xs rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {building ? "Starting..." : "Build"}
          </button>
        )}
        {feature.status === "live" && (
          <button
            onClick={handleBuild}
            disabled={building}
            className="px-4 py-2 text-xs rounded-lg bg-white/[0.06] text-white/60 hover:text-white hover:bg-white/[0.1] transition-colors"
          >
            Rebuild
          </button>
        )}
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="px-4 py-2 text-xs rounded-lg bg-white/[0.06] text-white/40 hover:text-white/60 transition-colors"
          >
            Edit
          </button>
        )}
        <button
          onClick={handleDelete}
          className="px-4 py-2 text-xs rounded-lg text-red-400/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          Delete
        </button>
      </div>

      {/* Children (if major feature) */}
      {feature.children && feature.children.length > 0 && (
        <div className="border-t border-white/[0.06] pt-4">
          <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-2">
            Sub-features
          </div>
          <div className="space-y-2">
            {feature.children.map((child: any) => (
              <div
                key={child.id}
                className="flex items-center justify-between px-3 py-2 rounded-md bg-white/[0.03] border border-white/[0.08]"
              >
                <div>
                  <div className="text-xs text-white/70">{child.title}</div>
                  <div className="text-[0.6rem] text-white/30">{child.status}</div>
                </div>
                <div className={`w-1.5 h-1.5 rounded-full ${
                  child.status === "live" ? "bg-green-400" :
                  child.status === "building" ? "bg-yellow-400 animate-pulse" :
                  "bg-white/20"
                }`} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create meeting pane**

```typescript
// src/components/pane-meeting.tsx
"use client";

import { useState } from "react";

type Suggestion = {
  id: string;
  suggestedTitle: string;
  suggestedDescription: string;
  suggestedPriority: string | null;
  suggestedParentTitle: string | null;
  status: string;
};

type Props = {
  meeting: {
    id: string;
    audioUrl: string;
    transcript: string | null;
    status: string;
    createdAt: string;
    suggestions: Suggestion[];
  };
  projectId: string;
  existingFeatures: { id: string; title: string }[];
  onUpdate: () => void;
};

export function PaneMeeting({ meeting, projectId, existingFeatures, onUpdate }: Props) {
  const [showTranscript, setShowTranscript] = useState(false);

  const pending = meeting.suggestions.filter((s) => s.status === "pending");
  const accepted = meeting.suggestions.filter((s) => s.status === "accepted");
  const dismissed = meeting.suggestions.filter((s) => s.status === "dismissed");

  async function handleAccept(suggestionId: string, parentId: string | null) {
    await fetch(`/api/suggestions/${suggestionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "accepted", parentId }),
    });
    onUpdate();
  }

  async function handleDismiss(suggestionId: string) {
    await fetch(`/api/suggestions/${suggestionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    });
    onUpdate();
  }

  const date = new Date(meeting.createdAt).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div>
      <h2 className="text-xl font-semibold text-[#f1f5f9] mb-1">Meeting</h2>
      <p className="text-xs text-white/40 mb-4">{date}</p>

      {/* Status */}
      {meeting.status !== "ready" && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4">
          <div className="text-xs text-yellow-400 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            {meeting.status === "transcribing" && "Transcribing audio..."}
            {meeting.status === "extracting" && "Extracting feature suggestions..."}
            {meeting.status === "uploading" && "Processing upload..."}
          </div>
        </div>
      )}

      {/* Audio player */}
      {meeting.audioUrl && (
        <div className="bg-white/[0.03] rounded-lg p-3 border border-white/[0.08] mb-4">
          <audio controls className="w-full h-8" src={meeting.audioUrl}>
            <track kind="captions" />
          </audio>
        </div>
      )}

      {/* Transcript */}
      {meeting.transcript && (
        <div className="mb-6">
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className="text-xs text-white/30 hover:text-white/50 transition-colors mb-2"
          >
            {showTranscript ? "Hide transcript" : "Show transcript"}
          </button>
          {showTranscript && (
            <div className="bg-white/[0.03] rounded-lg p-4 border border-white/[0.08] max-h-60 overflow-y-auto">
              <p className="text-xs text-white/50 whitespace-pre-wrap leading-relaxed">
                {meeting.transcript}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Pending suggestions */}
      {pending.length > 0 && (
        <div className="mb-6">
          <div className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-3">
            Feature suggestions ({pending.length})
          </div>
          <div className="space-y-3">
            {pending.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                existingFeatures={existingFeatures}
                onAccept={handleAccept}
                onDismiss={handleDismiss}
              />
            ))}
          </div>
        </div>
      )}

      {/* Accepted */}
      {accepted.length > 0 && (
        <div className="mb-4">
          <div className="text-[0.6rem] uppercase tracking-widest text-green-400/50 mb-2">
            Accepted ({accepted.length})
          </div>
          {accepted.map((s) => (
            <div key={s.id} className="text-xs text-white/30 py-1">
              {s.suggestedTitle}
            </div>
          ))}
        </div>
      )}

      {/* Dismissed */}
      {dismissed.length > 0 && (
        <div>
          <div className="text-[0.6rem] uppercase tracking-widest text-white/20 mb-2">
            Dismissed ({dismissed.length})
          </div>
          {dismissed.map((s) => (
            <div key={s.id} className="text-xs text-white/20 py-1 line-through">
              {s.suggestedTitle}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  existingFeatures,
  onAccept,
  onDismiss,
}: {
  suggestion: Suggestion;
  existingFeatures: { id: string; title: string }[];
  onAccept: (id: string, parentId: string | null) => void;
  onDismiss: (id: string) => void;
}) {
  const [parentId, setParentId] = useState<string | null>(null);

  const priorityColor: Record<string, string> = {
    high: "text-red-400 bg-red-500/10",
    medium: "text-yellow-400 bg-yellow-500/10",
    low: "text-white/40 bg-white/[0.06]",
  };

  return (
    <div className="bg-white/[0.03] rounded-lg p-4 border border-white/[0.08]">
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-sm font-medium text-white/80">{suggestion.suggestedTitle}</h4>
        {suggestion.suggestedPriority && (
          <span className={`text-[0.55rem] px-1.5 py-0.5 rounded ${
            priorityColor[suggestion.suggestedPriority] || priorityColor.low
          }`}>
            {suggestion.suggestedPriority}
          </span>
        )}
      </div>
      <p className="text-xs text-white/40 mb-3">{suggestion.suggestedDescription}</p>

      {suggestion.suggestedParentTitle && (
        <p className="text-[0.6rem] text-blue-400/60 mb-2">
          Suggested parent: {suggestion.suggestedParentTitle}
        </p>
      )}

      {/* Parent selector */}
      {existingFeatures.length > 0 && (
        <select
          value={parentId || ""}
          onChange={(e) => setParentId(e.target.value || null)}
          className="w-full bg-white/[0.03] border border-white/10 rounded px-2 py-1 text-xs text-white/60 mb-3 focus:outline-none"
        >
          <option value="">Add as major feature</option>
          {existingFeatures.map((f) => (
            <option key={f.id} value={f.id}>
              Under: {f.title}
            </option>
          ))}
        </select>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onAccept(suggestion.id, parentId)}
          className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors"
        >
          Add to tree
        </button>
        <button
          onClick={() => onDismiss(suggestion.id)}
          className="px-3 py-1.5 text-xs rounded-md text-white/30 hover:text-white/50 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/context-pane.tsx src/components/pane-project.tsx src/components/pane-feature.tsx src/components/pane-meeting.tsx
git commit -m "feat: context pane with project, feature, and meeting views

Right panel router showing detail views based on tree selection.
Feature pane has build/rebuild/edit/delete actions with progress bar.
Meeting pane shows suggestions with accept/dismiss and parent picker."
```

---

## Task 14: UI — Main Page Rewrite

**Files:**
- Rewrite: `src/app/page.tsx`
- Delete: old components

- [ ] **Step 1: Rewrite page.tsx**

```typescript
// src/app/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { ProjectSidebar } from "@/components/project-sidebar";
import { ProjectTree } from "@/components/project-tree";
import { ContextPane } from "@/components/context-pane";

type Selection =
  | { type: "project" }
  | { type: "feature"; id: string }
  | { type: "meeting"; id: string };

export default function Home() {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({ type: "project" });
  const [project, setProject] = useState<any>(null);

  const loadProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    const data = await res.json();
    setProjects(data);
  }, []);

  const loadProject = useCallback(async (id: string) => {
    const res = await fetch(`/api/projects/${id}`);
    const data = await res.json();
    setProject(data);
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (selectedProjectId) {
      loadProject(selectedProjectId);
    } else {
      setProject(null);
    }
  }, [selectedProjectId, loadProject]);

  // Poll during active builds or processing meetings
  useEffect(() => {
    if (!project) return;

    const allFeatures = [
      ...project.features,
      ...project.features.flatMap((f: any) => f.children || []),
    ];
    const hasActiveWork =
      allFeatures.some((f: any) => f.status === "building") ||
      project.meetings.some((m: any) =>
        ["transcribing", "extracting"].includes(m.status)
      ) ||
      project.deployStatus === "starting";

    if (!hasActiveWork) return;

    const interval = setInterval(() => loadProject(project.id), 2000);
    return () => clearInterval(interval);
  }, [project, loadProject]);

  async function handleToggle(featureId: string, enabled: boolean) {
    await fetch(`/api/features/${featureId}/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (selectedProjectId) loadProject(selectedProjectId);
  }

  async function handleAddFeature(parentId: string | null) {
    const title = prompt("Feature name:");
    if (!title) return;
    const description = prompt("Short description:") || title;

    await fetch(`/api/projects/${selectedProjectId}/features`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, parentId }),
    });
    if (selectedProjectId) loadProject(selectedProjectId);
  }

  async function handleUploadMeeting() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      const { url } = await uploadRes.json();

      await fetch(`/api/projects/${selectedProjectId}/meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl: url }),
      });

      if (selectedProjectId) loadProject(selectedProjectId);
    };
    input.click();
  }

  return (
    <div className="flex min-h-screen">
      <ProjectSidebar
        projects={projects}
        selectedId={selectedProjectId}
        onSelect={(id) => {
          setSelectedProjectId(id);
          setSelection({ type: "project" });
        }}
        onProjectCreated={loadProjects}
      />

      {project ? (
        <>
          <ProjectTree
            project={project}
            selection={selection}
            onSelect={setSelection}
            onToggle={handleToggle}
            onAddFeature={handleAddFeature}
          />
          <main className="flex-1 p-6">
            <ContextPane
              project={project}
              selection={selection}
              onUpdate={() => {
                if (selectedProjectId) loadProject(selectedProjectId);
                loadProjects();
              }}
            />

            {/* Upload meeting button */}
            <div className="mt-8 pt-4 border-t border-white/[0.06]">
              <button
                onClick={handleUploadMeeting}
                className="text-xs text-white/30 hover:text-white/50 transition-colors"
              >
                + Upload meeting recording
              </button>
            </div>
          </main>
        </>
      ) : (
        <main className="flex-1 p-6 flex items-center justify-center">
          <p className="text-white/50">Select or create a project to get started.</p>
        </main>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Delete old components**

```bash
rm src/components/sidebar.tsx
rm src/components/client-header.tsx
rm src/components/progress-stepper.tsx
rm src/components/step-upload.tsx
rm src/components/step-objectives.tsx
rm src/components/step-architect.tsx
rm src/components/step-build.tsx
rm src/components/step-deploy.tsx
rm src/components/objective-card.tsx
rm src/components/transcript-viewer.tsx
```

- [ ] **Step 3: Delete old API routes**

```bash
rm -rf src/app/api/clients
rm -rf src/app/api/meetings
rm -rf src/app/api/objectives
rm -rf src/app/api/builds
rm -rf src/app/api/progress
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: two-panel command center replaces wizard UI

Three-column layout: project sidebar, feature tree, context pane.
Removed old wizard components, step components, and API routes.
New flow: select project → manage feature tree → build/toggle modules."
```

---

## Task 15: Inngest Function Registration & Cleanup

**Files:**
- Modify: `src/app/api/inngest/route.ts`
- Verify all imports resolve

- [ ] **Step 1: Verify Inngest route (already done in Task 10)**

Confirm `src/app/api/inngest/route.ts` registers: `transcribe`, `extractSuggestions`, `createProject`, `buildFeature`.

- [ ] **Step 2: Verify build**

```bash
cd /Users/ryanhaugland/slushie-machine
npx next build
```

Expected: Build succeeds with no import errors.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve any remaining import/build errors"
```

---

## Task 16: Smoke Test

- [ ] **Step 1: Start dev environment**

```bash
cd /Users/ryanhaugland/slushie-machine
npx next dev -p 3002
# In another terminal:
npx inngest-cli@latest dev -u http://localhost:3002/api/inngest
```

- [ ] **Step 2: Test project creation**

Navigate to `http://localhost:3002`. Create a new project. Verify:
- Project appears in sidebar
- Base shell is copied to `previews/` directory
- Dev server starts on dynamic port
- Preview URL shows in project pane

- [ ] **Step 3: Test feature creation and build**

Add a feature manually (e.g., "Contact Management" — "CRUD for contacts with name, email, phone"). Click Build. Verify:
- Progress bar shows in feature pane
- Module files written to `previews/{slug}/features/{featureId}/`
- Manifest updated
- Feature shows as "Live" with green dot
- Preview app shows feature in sidebar and route works

- [ ] **Step 4: Test toggle**

Toggle the feature off. Verify:
- Feature disappears from preview app sidebar on refresh
- Toggle it back on — feature reappears
- No rebuild triggered

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: verified feature-tree architecture working end-to-end"
```
