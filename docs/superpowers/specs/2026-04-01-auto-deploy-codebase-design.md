# Auto-Deploy Codebase Pipeline

## Overview

When a user uploads a codebase zip and confirms the feature mapping, the system automatically deploys the uploaded code as a live preview. Features mapped from the codebase appear in the feature tree with working toggles — toggling a feature off hides it from the preview's navigation and blocks its routes, without deleting any code.

**Target user:** Consultant (Ryan) uploading existing client codebases to manage and demo them through slushie.machine.

---

## Flow

1. User drops zip on "Codebase" zone → uploads via existing `/api/upload`
2. AI analyzes the codebase → mapping UI appears (already built)
3. User assigns sections as Base or Major Feature, reviews minor features
4. User clicks "Create N Features" → `apply-mapping` API creates features in DB
5. `apply-mapping` also triggers `project/deploy-codebase` Inngest event with the uploaded file URL
6. Inngest function extracts zip to `previews/{slug}/`
7. Detects framework from `package.json` (Next.js or Vite/React)
8. Injects manifest layer (`features.json` + route-blocking middleware)
9. Runs `npm install`
10. Starts dev server on a dynamic port
11. Updates project with `deployUrl`, `port`, `deployStatus: "running"`

---

## Framework Detection

Read `package.json` `dependencies` and `devDependencies`:

| Signal | Framework | Start Command |
|--------|-----------|---------------|
| `next` in dependencies | Next.js | `npx next dev -p {port}` |
| `vite` or `@vitejs/plugin-react` in deps | Vite/React | `npx vite --port {port}` |
| Neither | Fallback | `PORT={port} npm run dev` |

---

## Manifest Injection

### `features.json`

Written to the project root from the confirmed mapping. Only major features (not minor/build instructions) appear:

```json
{
  "features": [
    {
      "id": "clxyz123",
      "title": "Contact Management",
      "route": "/contacts",
      "enabled": true
    },
    {
      "id": "clxyz456",
      "title": "Reporting",
      "route": "/reports",
      "enabled": true
    }
  ]
}
```

Routes are derived from the codebase analysis — the AI identifies which URL paths correspond to each feature section.

### Next.js Middleware

A `middleware.ts` file is injected (or appended to existing middleware) at the project root:

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

export function middleware(request: NextRequest) {
  try {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "features.json"), "utf-8")
    );
    const disabledRoutes = manifest.features
      .filter((f: any) => !f.enabled)
      .map((f: any) => f.route);

    const pathname = request.nextUrl.pathname;
    if (disabledRoutes.some((r: string) => pathname.startsWith(r))) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  } catch {}
  return NextResponse.next();
}
```

### Vite/React Route Guard

For Vite apps, a `_slushie-guard.js` module is injected and the main router file is patched to import it. The guard reads `features.json` at startup and filters disabled routes.

### Nav Filtering

The analysis identifies the nav/sidebar component. The manifest injection step patches it to read `features.json` and hide disabled feature links. This is a targeted code patch — find the nav component, wrap its items in a filter that checks the manifest.

If the nav component can't be reliably patched, a CSS-based fallback hides nav items by adding `data-feature-id` attributes and a style block that sets `display: none` for disabled features.

---

## Toggle Behavior

- Toggling a major feature updates `features.json` on disk (existing behavior in toggle API)
- Next.js middleware reads the manifest on each request — disabled routes redirect to `/`
- Nav items for disabled features are hidden
- No code is deleted or modified — only the manifest changes
- Toggling back on restores the route and nav item immediately

---

## Changes Required

### Modified: `src/app/api/projects/[id]/apply-mapping/route.ts`

After creating features in DB, also:
1. Store the uploaded zip file URL on the project (add to PATCH data or pass via event)
2. Send `project/deploy-codebase` Inngest event with `{ projectId, fileUrl }`

### New: `src/inngest/deploy-codebase.ts`

Inngest function with steps:

1. **Extract zip** — read the uploaded zip, extract to `previews/{slug}/`
2. **Detect framework** — read `package.json`, determine Next.js vs Vite vs fallback
3. **Inject manifest** — write `features.json`, inject middleware/route guard
4. **Install dependencies** — run `npm install` in the project directory
5. **Start server** — spawn the dev server on a dynamic port (find available port starting at 4000)
6. **Update project** — set `deployUrl`, `port`, `deployStatus: "running"`

### Modified: `src/prompts/codebase-analyzer.ts`

Add `route` field to the analysis output — the AI should identify what URL path each feature section maps to (e.g., `/contacts`, `/dashboard`, `/reports`). This is needed for the manifest.

### No Changes Needed

- Toggle API — already writes `features.json` for major features
- Feature tree UI — already shows features from the mapping
- Project pane — already shows deploy URL and status
- Existing `create-project.ts` — stays as-is for base-shell projects

---

## Data Model

No schema changes needed. Existing fields cover everything:
- `Project.port` — stores the dev server port
- `Project.deployUrl` — stores `http://localhost:{port}`
- `Project.deployStatus` — `stopped` / `starting` / `running` / `error`

The uploaded zip file URL is passed through the Inngest event data — no need to persist it separately since it's only used during the deploy step.

---

## What's NOT in Scope

- Vite route guard implementation details (simple for now — can be enhanced in phase B)
- AI-powered nav patching (use CSS fallback for v1 if nav detection is unreliable)
- Hot reload of uploaded codebases after feature builds (that's phase C — builder bot)
- Production deployment (previews are local dev servers accessed via ngrok)
