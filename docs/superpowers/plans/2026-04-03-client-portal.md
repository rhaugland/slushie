# Client Portal MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a client-facing portal at `/portal` where invited clients can view project previews, browse and vote on wishlist items, and submit feedback.

**Architecture:** A `/portal` route group in the existing Next.js app with a dedicated layout (no internal sidebar). Clients authenticate via the same JWT system but are authorized through `ClientMember` + `ClientMemberProject` records. A new `WishlistVote` model tracks client votes. All portal API routes live under `/api/portal/`.

**Tech Stack:** Next.js 16, React 19, Prisma 7 (PostgreSQL), TailwindCSS 4, jose (JWT), bcrypt

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `prisma/migrations/XXXXXX_client_portal/migration.sql` | Schema migration (auto-generated) |
| `src/lib/portal-auth.ts` | `getCurrentClientUser()` helper |
| `src/app/api/portal/login/route.ts` | Client login endpoint |
| `src/app/api/portal/projects/route.ts` | List client's projects |
| `src/app/api/portal/projects/[id]/preview/route.ts` | Get project deploy URL |
| `src/app/api/portal/projects/[id]/wishlist/route.ts` | Wishlist items with vote counts |
| `src/app/api/portal/wishlist/[id]/vote/route.ts` | Cast/change/remove vote |
| `src/app/api/portal/projects/[id]/feedback/route.ts` | GET + POST client feedback |
| `src/app/portal/layout.tsx` | Portal layout (no sidebar) |
| `src/app/portal/login/page.tsx` | Client login page |
| `src/app/portal/page.tsx` | Project list |
| `src/app/portal/[projectId]/page.tsx` | Project view with tabs |

### Modified Files
| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add WishlistVote model, add clientMemberId to FeedbackItem, add relations |

---

### Task 1: Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/XXXXXX_client_portal/migration.sql` (auto-generated)

- [ ] **Step 1: Add WishlistVote model to schema**

In `prisma/schema.prisma`, add after the `FeedbackItem` model (after line 255):

```prisma
model WishlistVote {
  id             String       @id @default(cuid())
  wishlistItemId String
  clientMemberId String
  vote           Int          // +1 or -1
  createdAt      DateTime     @default(now())

  wishlistItem   WishlistItem @relation(fields: [wishlistItemId], references: [id], onDelete: Cascade)
  clientMember   ClientMember @relation(fields: [clientMemberId], references: [id], onDelete: Cascade)

  @@unique([wishlistItemId, clientMemberId])
  @@index([wishlistItemId])
}
```

- [ ] **Step 2: Add clientMemberId to FeedbackItem**

In `prisma/schema.prisma`, in the `FeedbackItem` model, add after the `wishlistItemId` field (after line 249):

```prisma
  clientMemberId String?
  clientMember   ClientMember? @relation(fields: [clientMemberId], references: [id])
```

- [ ] **Step 3: Add votes relation to WishlistItem**

In `prisma/schema.prisma`, in the `WishlistItem` model, add after the `meeting` relation line:

```prisma
  votes          WishlistVote[]
```

- [ ] **Step 4: Add relations to ClientMember**

In `prisma/schema.prisma`, in the `ClientMember` model, add after the `projectAccess` relation line:

```prisma
  wishlistVotes  WishlistVote[]
  feedbackItems  FeedbackItem[]
```

- [ ] **Step 5: Create and apply migration**

Create the migration SQL file manually (since the shell is non-interactive, `prisma migrate dev` won't work):

Create file `prisma/migrations/XXXXXX_client_portal/migration.sql` (replace XXXXXX with a timestamp like `20260403120000`):

```sql
-- CreateTable
CREATE TABLE "WishlistVote" (
    "id" TEXT NOT NULL,
    "wishlistItemId" TEXT NOT NULL,
    "clientMemberId" TEXT NOT NULL,
    "vote" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistVote_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "FeedbackItem" ADD COLUMN "clientMemberId" TEXT;

-- CreateIndex
CREATE INDEX "WishlistVote_wishlistItemId_idx" ON "WishlistVote"("wishlistItemId");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistVote_wishlistItemId_clientMemberId_key" ON "WishlistVote"("wishlistItemId", "clientMemberId");

-- AddForeignKey
ALTER TABLE "FeedbackItem" ADD CONSTRAINT "FeedbackItem_clientMemberId_fkey" FOREIGN KEY ("clientMemberId") REFERENCES "ClientMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistVote" ADD CONSTRAINT "WishlistVote_wishlistItemId_fkey" FOREIGN KEY ("wishlistItemId") REFERENCES "WishlistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistVote" ADD CONSTRAINT "WishlistVote_clientMemberId_fkey" FOREIGN KEY ("clientMemberId") REFERENCES "ClientMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Run:
```bash
npx prisma migrate deploy
```

Expected: Migration applied successfully.

- [ ] **Step 6: Generate Prisma client**

Run:
```bash
npx prisma generate
```

Expected: Prisma Client generated.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add WishlistVote model and FeedbackItem.clientMemberId for client portal"
```

---

### Task 2: Portal Auth Helper

**Files:**
- Create: `src/lib/portal-auth.ts`

- [ ] **Step 1: Create getCurrentClientUser helper**

Create `src/lib/portal-auth.ts`:

```typescript
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "slushie-machine-dev-secret-change-in-prod"
);
const COOKIE_NAME = "session";

export async function getCurrentClientUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  let payload: { userId: string; email: string };
  try {
    const result = await jwtVerify(token, JWT_SECRET);
    payload = { userId: result.payload.userId as string, email: result.payload.email as string };
  } catch {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      name: true,
      clientMemberships: {
        include: {
          client: { select: { id: true, name: true } },
          projectAccess: {
            include: {
              project: { select: { id: true, name: true, deployUrl: true } },
            },
          },
        },
      },
    },
  });

  if (!user || user.clientMemberships.length === 0) return null;

  return user;
}
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
npx tsc --noEmit src/lib/portal-auth.ts 2>&1 || echo "Check for errors"
```

If TypeScript standalone check doesn't work, verify by running:
```bash
npm run build 2>&1 | head -30
```

Expected: No errors related to `portal-auth.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/portal-auth.ts
git commit -m "feat: add getCurrentClientUser auth helper for client portal"
```

---

### Task 3: Portal Login API

**Files:**
- Create: `src/app/api/portal/login/route.ts`

- [ ] **Step 1: Create portal login endpoint**

Create `src/app/api/portal/login/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      clientMemberships: { select: { id: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  if (user.clientMemberships.length === 0) {
    return NextResponse.json({ error: "No client access. Contact your project team for an invite." }, { status: 403 });
  }

  // Claim any pending client member invites
  const pendingClientMembers = await prisma.clientMember.findMany({
    where: { invitedEmail: email, userId: null },
  });
  for (const cm of pendingClientMembers) {
    await prisma.clientMember.update({
      where: { id: cm.id },
      data: { userId: user.id, invitedEmail: null },
    });
  }

  await setSessionCookie(user.id, user.email);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Test with curl**

Start dev server if not running, then:
```bash
curl -s -X POST http://localhost:3000/api/portal/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"wrong"}' | head -1
```

Expected: `{"error":"Invalid email or password"}` with status 401.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/portal/login/route.ts
git commit -m "feat: add portal login API endpoint"
```

---

### Task 4: Portal Projects API

**Files:**
- Create: `src/app/api/portal/projects/route.ts`

- [ ] **Step 1: Create projects list endpoint**

Create `src/app/api/portal/projects/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { getCurrentClientUser } from "@/lib/portal-auth";

export async function GET() {
  const user = await getCurrentClientUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projects = user.clientMemberships.flatMap((cm) =>
    cm.projectAccess.map((pa) => ({
      id: pa.project.id,
      name: pa.project.name,
      clientName: cm.client.name,
      deployUrl: pa.project.deployUrl,
    }))
  );

  return NextResponse.json({ projects });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/portal/projects/route.ts
git commit -m "feat: add portal projects list API"
```

---

### Task 5: Portal Preview API

**Files:**
- Create: `src/app/api/portal/projects/[id]/preview/route.ts`

- [ ] **Step 1: Create preview endpoint**

Create `src/app/api/portal/projects/[id]/preview/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentClientUser } from "@/lib/portal-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentClientUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Check the client has access to this project
  const hasAccess = user.clientMemberships.some((cm) =>
    cm.projectAccess.some((pa) => pa.project.id === id)
  );
  if (!hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Find the deploy URL from the user's memberships
  let deployUrl: string | null = null;
  for (const cm of user.clientMemberships) {
    for (const pa of cm.projectAccess) {
      if (pa.project.id === id) {
        deployUrl = pa.project.deployUrl;
        break;
      }
    }
  }

  return NextResponse.json({ deployUrl });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/portal/projects/[id]/preview/route.ts
git commit -m "feat: add portal preview API endpoint"
```

---

### Task 6: Portal Wishlist + Vote APIs

**Files:**
- Create: `src/app/api/portal/projects/[id]/wishlist/route.ts`
- Create: `src/app/api/portal/wishlist/[id]/vote/route.ts`

- [ ] **Step 1: Create wishlist list endpoint**

Create `src/app/api/portal/projects/[id]/wishlist/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentClientUser } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentClientUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Check project access
  const hasAccess = user.clientMemberships.some((cm) =>
    cm.projectAccess.some((pa) => pa.project.id === id)
  );
  if (!hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Get the client member ID for this project's client
  let clientMemberId: string | null = null;
  for (const cm of user.clientMemberships) {
    if (cm.projectAccess.some((pa) => pa.project.id === id)) {
      clientMemberId = cm.id;
      break;
    }
  }

  const items = await prisma.wishlistItem.findMany({
    where: { projectId: id },
    include: {
      votes: {
        select: { vote: true, clientMemberId: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = items.map((item) => {
    const voteCount = item.votes.reduce((sum, v) => sum + v.vote, 0);
    const clientVote = item.votes.find((v) => v.clientMemberId === clientMemberId)?.vote ?? null;
    return {
      id: item.id,
      title: item.title,
      description: item.description,
      priority: item.priority,
      status: item.status,
      voteCount,
      clientVote,
    };
  });

  // Sort by vote count descending, then createdAt descending
  result.sort((a, b) => b.voteCount - a.voteCount);

  return NextResponse.json({ items: result });
}
```

- [ ] **Step 2: Create vote endpoint**

Create `src/app/api/portal/wishlist/[id]/vote/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentClientUser } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentClientUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: wishlistItemId } = await params;
  const { vote } = await req.json();

  if (vote !== 1 && vote !== -1 && vote !== 0) {
    return NextResponse.json({ error: "vote must be 1, -1, or 0" }, { status: 400 });
  }

  // Verify the wishlist item exists and the client has access to its project
  const wishlistItem = await prisma.wishlistItem.findUnique({
    where: { id: wishlistItemId },
    select: { projectId: true },
  });

  if (!wishlistItem || !wishlistItem.projectId) {
    return NextResponse.json({ error: "Wishlist item not found" }, { status: 404 });
  }

  // Find the client member for this project
  let clientMemberId: string | null = null;
  for (const cm of user.clientMemberships) {
    if (cm.projectAccess.some((pa) => pa.project.id === wishlistItem.projectId)) {
      clientMemberId = cm.id;
      break;
    }
  }

  if (!clientMemberId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  if (vote === 0) {
    // Remove vote
    await prisma.wishlistVote.deleteMany({
      where: { wishlistItemId, clientMemberId },
    });
  } else {
    // Upsert vote
    await prisma.wishlistVote.upsert({
      where: { wishlistItemId_clientMemberId: { wishlistItemId, clientMemberId } },
      update: { vote },
      create: { wishlistItemId, clientMemberId, vote },
    });
  }

  // Return updated vote count
  const votes = await prisma.wishlistVote.findMany({
    where: { wishlistItemId },
    select: { vote: true, clientMemberId: true },
  });

  const voteCount = votes.reduce((sum, v) => sum + v.vote, 0);
  const clientVote = votes.find((v) => v.clientMemberId === clientMemberId)?.vote ?? null;

  return NextResponse.json({ voteCount, clientVote });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/portal/projects/[id]/wishlist/route.ts src/app/api/portal/wishlist/[id]/vote/route.ts
git commit -m "feat: add portal wishlist and vote API endpoints"
```

---

### Task 7: Portal Feedback API

**Files:**
- Create: `src/app/api/portal/projects/[id]/feedback/route.ts`

- [ ] **Step 1: Create feedback GET + POST endpoint**

Create `src/app/api/portal/projects/[id]/feedback/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getCurrentClientUser } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentClientUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Find client member for this project
  let clientMemberId: string | null = null;
  for (const cm of user.clientMemberships) {
    if (cm.projectAccess.some((pa) => pa.project.id === id)) {
      clientMemberId = cm.id;
      break;
    }
  }

  if (!clientMemberId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const items = await prisma.feedbackItem.findMany({
    where: { projectId: id, clientMemberId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      text: true,
      title: true,
      description: true,
      priority: true,
      featureType: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ items });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentClientUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { text } = await req.json();

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  // Find client member for this project
  let clientMemberId: string | null = null;
  for (const cm of user.clientMemberships) {
    if (cm.projectAccess.some((pa) => pa.project.id === id)) {
      clientMemberId = cm.id;
      break;
    }
  }

  if (!clientMemberId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const feedbackItem = await prisma.feedbackItem.create({
    data: {
      projectId: id,
      clientMemberId,
      text: text.trim(),
      status: "pending",
    },
  });

  // Trigger AI analysis (reuses existing Inngest pipeline)
  const { inngest } = await import("@/inngest/client");
  await inngest.send({
    name: "feedback/analyze",
    data: { feedbackItemId: feedbackItem.id },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/portal/projects/[id]/feedback/route.ts
git commit -m "feat: add portal feedback API endpoints"
```

---

### Task 8: Portal Layout + Login Page

**Files:**
- Create: `src/app/portal/layout.tsx`
- Create: `src/app/portal/login/page.tsx`

- [ ] **Step 1: Create portal layout**

Create `src/app/portal/layout.tsx`:

```tsx
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#080d19] text-white">
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create portal login page**

Create `src/app/portal/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PortalLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/portal/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Login failed");
        return;
      }
      router.push("/portal");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm p-6">
        <h1 className="text-2xl font-bold text-center mb-2">
          <span className="bg-gradient-to-r from-red-500 to-blue-500 bg-clip-text text-transparent">
            slushie.machine
          </span>
        </h1>
        <p className="text-xs text-white/40 text-center leading-relaxed mb-8 max-w-xs mx-auto">
          Your project portal — previews, features, and feedback in one place.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 text-sm rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify pages render**

Run:
```bash
npm run dev &
sleep 3
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/portal/login
```

Expected: `200`

- [ ] **Step 4: Commit**

```bash
git add src/app/portal/layout.tsx src/app/portal/login/page.tsx
git commit -m "feat: add portal layout and client login page"
```

---

### Task 9: Portal Project List Page

**Files:**
- Create: `src/app/portal/page.tsx`

- [ ] **Step 1: Create project list page**

Create `src/app/portal/page.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface PortalProject {
  id: string;
  name: string;
  clientName: string;
  deployUrl: string | null;
}

export default function PortalPage() {
  const [projects, setProjects] = useState<PortalProject[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/portal/projects");
      if (res.status === 401) {
        router.push("/portal/login");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        // Auto-redirect if only one project
        if (data.projects.length === 1) {
          router.push(`/portal/${data.projects[0].id}`);
          return;
        }
        setProjects(data.projects);
      }
      setLoading(false);
    }
    load();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/40 text-sm">Loading...</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold text-white/60 mb-2">No projects yet</h1>
          <p className="text-sm text-white/30">Your team hasn&apos;t added you to any projects yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">
          <span className="bg-gradient-to-r from-red-500 to-blue-500 bg-clip-text text-transparent">
            slushie.machine
          </span>
        </h1>
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            router.push("/portal/login");
          }}
          className="text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          Sign out
        </button>
      </div>

      {/* Project grid */}
      <div className="max-w-3xl mx-auto px-6 py-10">
        <h2 className="text-sm font-medium text-white/50 mb-4">Your Projects</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => router.push(`/portal/${p.id}`)}
              className="text-left bg-white/[0.03] border border-white/[0.06] rounded-lg p-4 hover:border-white/[0.12] transition-colors"
            >
              <p className="text-sm font-medium text-white">{p.name}</p>
              <p className="text-xs text-white/30 mt-1">{p.clientName}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/portal/page.tsx
git commit -m "feat: add portal project list page"
```

---

### Task 10: Portal Project View Page

**Files:**
- Create: `src/app/portal/[projectId]/page.tsx`

- [ ] **Step 1: Create project view page with all three tabs**

Create `src/app/portal/[projectId]/page.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";

type Tab = "preview" | "wishlist" | "feedback";

interface WishlistItem {
  id: string;
  title: string;
  description: string;
  priority: string | null;
  status: string;
  voteCount: number;
  clientVote: number | null;
}

interface FeedbackItem {
  id: string;
  text: string;
  title: string | null;
  priority: string | null;
  featureType: string | null;
  status: string;
  createdAt: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-400 bg-red-400/10",
  medium: "text-yellow-400 bg-yellow-400/10",
  low: "text-green-400 bg-green-400/10",
};

export default function PortalProjectPage() {
  const [tab, setTab] = useState<Tab>("preview");
  const [deployUrl, setDeployUrl] = useState<string | null>(null);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;

  // Load project info
  useEffect(() => {
    async function load() {
      const res = await fetch("/api/portal/projects");
      if (res.status === 401) {
        router.push("/portal/login");
        return;
      }
      if (res.ok) {
        const data = await res.json();
        const project = data.projects.find((p: { id: string }) => p.id === projectId);
        if (!project) {
          router.push("/portal");
          return;
        }
        setProjectName(project.name);
      }
      setLoading(false);
    }
    load();
  }, [projectId, router]);

  // Load preview URL
  useEffect(() => {
    if (tab !== "preview") return;
    async function loadPreview() {
      const res = await fetch(`/api/portal/projects/${projectId}/preview`);
      if (res.ok) {
        const data = await res.json();
        setDeployUrl(data.deployUrl);
      }
    }
    loadPreview();
  }, [tab, projectId]);

  // Load wishlist
  const loadWishlist = useCallback(async () => {
    const res = await fetch(`/api/portal/projects/${projectId}/wishlist`);
    if (res.ok) {
      const data = await res.json();
      setWishlistItems(data.items);
    }
  }, [projectId]);

  useEffect(() => {
    if (tab === "wishlist") loadWishlist();
  }, [tab, loadWishlist]);

  // Load feedback
  const loadFeedback = useCallback(async () => {
    const res = await fetch(`/api/portal/projects/${projectId}/feedback`);
    if (res.ok) {
      const data = await res.json();
      setFeedbackItems(data.items);
    }
  }, [projectId]);

  useEffect(() => {
    if (tab === "feedback") loadFeedback();
  }, [tab, loadFeedback]);

  // Poll feedback while pending items exist
  useEffect(() => {
    if (tab !== "feedback") return;
    const hasPending = feedbackItems.some((f) => f.status === "pending");
    if (!hasPending) return;
    const interval = setInterval(loadFeedback, 3000);
    return () => clearInterval(interval);
  }, [tab, feedbackItems, loadFeedback]);

  async function handleVote(itemId: string, vote: number) {
    const res = await fetch(`/api/portal/wishlist/${itemId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vote }),
    });
    if (res.ok) {
      const data = await res.json();
      setWishlistItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? { ...item, voteCount: data.voteCount, clientVote: data.clientVote }
            : item
        )
      );
    }
  }

  async function handleSubmitFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (!feedbackText.trim()) return;
    setSubmitting(true);
    const res = await fetch(`/api/portal/projects/${projectId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: feedbackText }),
    });
    if (res.ok) {
      setFeedbackText("");
      setFeedbackSent(true);
      setTimeout(() => setFeedbackSent(false), 2000);
      loadFeedback();
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/40 text-sm">Loading...</p>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "preview", label: "Preview" },
    { key: "wishlist", label: "Wishlist" },
    { key: "feedback", label: "Feedback" },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/portal")}
            className="text-sm font-bold bg-gradient-to-r from-red-500 to-blue-500 bg-clip-text text-transparent"
          >
            slushie.machine
          </button>
          <span className="text-white/20">|</span>
          <span className="text-sm font-medium text-white/70">{projectName}</span>
        </div>
        <button
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            router.push("/portal/login");
          }}
          className="text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          Sign out
        </button>
      </div>

      {/* Tab bar */}
      <div className="border-b border-white/[0.06] px-6 flex gap-1 shrink-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
              tab === t.key
                ? "text-white"
                : "text-white/30 hover:text-white/60"
            }`}
          >
            {t.label}
            {tab === t.key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-red-500 to-blue-500" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {/* Preview tab */}
        {tab === "preview" && (
          <div className="h-full flex flex-col">
            {deployUrl ? (
              <>
                <iframe
                  src={`${deployUrl}?isolate=true`}
                  className="flex-1 w-full border-0"
                  title="Project Preview"
                />
                <div className="px-6 py-2 border-t border-white/[0.06]">
                  <a
                    href={`${deployUrl}?isolate=true`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Open in new tab
                  </a>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-white/30">Preview not available yet</p>
              </div>
            )}
          </div>
        )}

        {/* Wishlist tab */}
        {tab === "wishlist" && (
          <div className="max-w-2xl mx-auto px-6 py-6">
            {wishlistItems.length === 0 ? (
              <p className="text-sm text-white/30 text-center py-10">No wishlist items yet</p>
            ) : (
              <div className="space-y-2">
                {wishlistItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4"
                  >
                    <div className="flex items-start gap-3">
                      {/* Vote buttons */}
                      <div className="flex flex-col items-center gap-0.5 pt-0.5">
                        <button
                          onClick={() =>
                            handleVote(item.id, item.clientVote === 1 ? 0 : 1)
                          }
                          className={`text-lg leading-none transition-colors ${
                            item.clientVote === 1
                              ? "text-blue-400"
                              : "text-white/20 hover:text-white/50"
                          }`}
                        >
                          ▲
                        </button>
                        <span className="text-xs font-medium text-white/50">
                          {item.voteCount}
                        </span>
                        <button
                          onClick={() =>
                            handleVote(item.id, item.clientVote === -1 ? 0 : -1)
                          }
                          className={`text-lg leading-none transition-colors ${
                            item.clientVote === -1
                              ? "text-red-400"
                              : "text-white/20 hover:text-white/50"
                          }`}
                        >
                          ▼
                        </button>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-white">{item.title}</h3>
                          {item.priority && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                PRIORITY_COLORS[item.priority] || "text-white/40 bg-white/5"
                              }`}
                            >
                              {item.priority}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-white/40 mt-1 line-clamp-2">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Feedback tab */}
        {tab === "feedback" && (
          <div className="max-w-2xl mx-auto px-6 py-6">
            {/* Submit form */}
            <form onSubmit={handleSubmitFeedback} className="mb-6">
              <label className="block text-sm font-medium text-white/50 mb-2">
                What could be better?
              </label>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Tell us what you think..."
                rows={3}
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20 resize-none"
              />
              <div className="flex items-center gap-3 mt-2">
                <button
                  type="submit"
                  disabled={submitting || !feedbackText.trim()}
                  className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {submitting ? "Sending..." : "Send feedback"}
                </button>
                {feedbackSent && (
                  <span className="text-xs text-green-400">Thanks for your feedback!</span>
                )}
              </div>
            </form>

            {/* Previous feedback */}
            {feedbackItems.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-white/50 mb-3">Your feedback</h3>
                <div className="space-y-2">
                  {feedbackItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4"
                    >
                      <p className="text-xs text-white/40 mb-1.5">
                        {new Date(item.createdAt).toLocaleDateString()}
                        {item.status === "pending" && (
                          <span className="ml-2 text-yellow-400">Analyzing...</span>
                        )}
                      </p>
                      <p className="text-sm text-white/70">{item.text}</p>
                      {item.title && (
                        <div className="mt-2 pt-2 border-t border-white/[0.06]">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-medium text-white/50">{item.title}</p>
                            {item.priority && (
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                  PRIORITY_COLORS[item.priority] || "text-white/40 bg-white/5"
                                }`}
                              >
                                {item.priority}
                              </span>
                            )}
                            {item.featureType && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium text-blue-400 bg-blue-400/10">
                                {item.featureType}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the page compiles**

Run:
```bash
npm run build 2>&1 | tail -20
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/portal/[projectId]/page.tsx
git commit -m "feat: add portal project view with preview, wishlist, and feedback tabs"
```

---

### Task 11: Add Client Portal to Wishlist

**Files:**
- No file changes — API call only

- [ ] **Step 1: Find a project ID and client ID to use**

Run:
```bash
curl -s http://localhost:3000/api/auth/me -b "session=<cookie>" 2>/dev/null || echo "Get IDs from database"
```

Or query directly:
```bash
npx tsx -e "
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const p = await prisma.project.findFirst({ select: { id: true, clientId: true } });
console.log(JSON.stringify(p));
await prisma.\$disconnect();
"
```

- [ ] **Step 2: Create wishlist item for Client Portal**

Using the project and client IDs found in step 1:

```bash
npx tsx -e "
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const project = await prisma.project.findFirst({ select: { id: true, clientId: true } });
if (!project) { console.log('No project found'); process.exit(1); }
const item = await prisma.wishlistItem.create({
  data: {
    title: 'Client Portal MVP',
    description: 'Client-facing portal at /portal — clients can view project previews in an iframe, browse and vote on wishlist items, and submit feedback. Includes dedicated login, project list, and tabbed project view.',
    priority: 'high',
    source: 'manual',
    status: 'pending',
    clientId: project.clientId,
    projectId: project.id,
  },
});
console.log('Created wishlist item:', item.id);
await prisma.\$disconnect();
"
```

Expected: `Created wishlist item: <cuid>`

- [ ] **Step 3: No commit needed (database change only)**

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Client login at `/portal/login` → Task 8
- ✅ `getCurrentClientUser()` auth helper → Task 2
- ✅ Portal login API with client membership check → Task 3
- ✅ Project list at `/portal` with auto-redirect → Task 9
- ✅ Project view with Preview/Wishlist/Feedback tabs → Task 10
- ✅ Preview iframe with `?isolate=true` and fallback link → Task 10
- ✅ Wishlist with vote counts and up/down voting → Tasks 6, 10
- ✅ Feedback submission with AI analysis pipeline reuse → Tasks 7, 10
- ✅ Feedback polling while pending → Task 10
- ✅ WishlistVote model → Task 1
- ✅ FeedbackItem.clientMemberId → Task 1
- ✅ Portal layout (no sidebar) → Task 8
- ✅ Add to wishlist → Task 11

**Placeholder scan:** No TBD, TODO, or vague steps found.

**Type consistency:** `WishlistItem`, `FeedbackItem`, `PortalProject` types are consistent across all tasks. `getCurrentClientUser()` returns the same shape everywhere. API response formats match what the frontend expects.
