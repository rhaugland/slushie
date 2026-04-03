# Client Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the data model from Workspace → Project to Workspace → Client → Project, with user access managed at the client level with per-project grants.

**Architecture:** Add a Client model between Workspace and Project. Replace ProjectMember with ClientMember + ClientMemberProject join table. Users are invited to clients and granted access to specific projects. Workspace membership is auto-created as a side effect. Sidebar becomes three-level: workspace → client → project.

**Tech Stack:** Next.js 16, Prisma with PrismaPg adapter, PostgreSQL, React

**Important codebase conventions:**
- Next.js 16 uses `proxy.ts` (not `middleware.ts`) with `export async function proxy()`
- Route params are async: `{ params }: { params: Promise<{ id: string }> }` — must `await params`
- Prisma client is constructed with PrismaPg adapter (see `src/lib/prisma.ts`)
- `getCurrentUser()` in `src/lib/auth.ts` returns user with memberships including workspace data
- All fetches in page.tsx use `{ cache: "no-store" }` to avoid production caching
- Build with `npx next build`, run with `npx next start -p 3002`
- DATABASE_URL: `postgresql://ryanhaugland@localhost:5432/slushie_machine`

---

### Task 1: Prisma Schema — Add Client, ClientMember, ClientMemberProject models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add Client model to schema**

Add after the `Workspace` model in `prisma/schema.prisma`:

```prisma
model Client {
  id          String         @id @default(cuid())
  name        String
  workspaceId String
  createdAt   DateTime       @default(now())
  workspace   Workspace      @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  projects    Project[]
  members     ClientMember[]

  @@index([workspaceId])
}

model ClientMember {
  id           String                @id @default(cuid())
  clientId     String
  userId       String?
  invitedEmail String?
  role         String                @default("member")
  createdAt    DateTime              @default(now())
  client       Client                @relation(fields: [clientId], references: [id], onDelete: Cascade)
  user         User?                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  projectAccess ClientMemberProject[]

  @@unique([clientId, userId])
  @@index([clientId])
  @@index([userId])
  @@index([invitedEmail])
}

model ClientMemberProject {
  id             String       @id @default(cuid())
  clientMemberId String
  projectId      String
  clientMember   ClientMember @relation(fields: [clientMemberId], references: [id], onDelete: Cascade)
  project        Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([clientMemberId, projectId])
  @@index([clientMemberId])
  @@index([projectId])
}
```

- [ ] **Step 2: Update Workspace model to add clients relation**

In the `Workspace` model, add after `projects  Project[]`:

```prisma
  clients   Client[]
```

- [ ] **Step 3: Update User model to add client memberships**

In the `User` model, add after `projectMemberships ProjectMember[]`:

```prisma
  clientMemberships ClientMember[]
```

- [ ] **Step 4: Update Project model — add clientId, add clientMemberAccess relation**

In the `Project` model:
- Add `clientId String?` field (nullable for now, will be made required after migration)
- Add `client Client? @relation(fields: [clientId], references: [id], onDelete: Cascade)`
- Add `clientMemberAccess ClientMemberProject[]`
- Add `@@index([clientId])`
- Keep `workspaceId`, `clientName`, `members`, and `ProjectMember` model for now (removed in a later task after data migration)

```prisma
model Project {
  id           String    @id @default(cuid())
  name         String
  clientName   String
  clientId     String?
  workspaceId  String
  themeConfig  Json      @default("{}")
  baseVersion  String    @default("1.0.0")
  manifestJson Json      @default("{\"features\":[]}")
  deployUrl    String?
  deployStatus String    @default("stopped")
  port         Int?
  createdAt    DateTime  @default(now())
  workspace    Workspace       @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  client       Client?         @relation(fields: [clientId], references: [id], onDelete: Cascade)
  features     Feature[]
  meetings     Meeting[]
  members      ProjectMember[]
  clientMemberAccess ClientMemberProject[]

  @@index([workspaceId])
  @@index([clientId])
}
```

- [ ] **Step 5: Generate and run migration**

```bash
npx prisma migrate dev --name add_client_hierarchy
```

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add Client, ClientMember, ClientMemberProject models to schema"
```

---

### Task 2: Data Migration — Create Client records and backfill

**Files:**
- Create: `prisma/migrate-clients.ts`

- [ ] **Step 1: Write migration script**

Create `prisma/migrate-clients.ts`:

```typescript
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL || "postgresql://ryanhaugland@localhost:5432/slushie_machine",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  // 1. Find all unique (workspaceId, clientName) pairs from projects
  const projects = await prisma.project.findMany({
    select: { id: true, workspaceId: true, clientName: true },
  });

  const seen = new Map<string, string>(); // "wsId:clientName" -> clientId

  for (const p of projects) {
    const key = `${p.workspaceId}:${p.clientName}`;
    if (!seen.has(key)) {
      const client = await prisma.client.create({
        data: {
          name: p.clientName,
          workspaceId: p.workspaceId,
        },
      });
      seen.set(key, client.id);
      console.log(`Created client "${p.clientName}" (${client.id}) in workspace ${p.workspaceId}`);
    }

    // 2. Update project with clientId
    const clientId = seen.get(key)!;
    await prisma.project.update({
      where: { id: p.id },
      data: { clientId },
    });
    console.log(`  Linked project "${p.id}" to client ${clientId}`);
  }

  // 3. Migrate ProjectMembers to ClientMembers + ClientMemberProject
  const projectMembers = await prisma.projectMember.findMany({
    include: { project: { select: { clientId: true } } },
  });

  const clientMemberSeen = new Map<string, string>(); // "clientId:userId" -> clientMemberId

  for (const pm of projectMembers) {
    const clientId = pm.project.clientId;
    if (!clientId) {
      console.log(`  Skipping ProjectMember ${pm.id} — project has no clientId`);
      continue;
    }

    const userKey = pm.userId
      ? `${clientId}:user:${pm.userId}`
      : `${clientId}:email:${pm.invitedEmail}`;

    if (!clientMemberSeen.has(userKey)) {
      const cm = await prisma.clientMember.create({
        data: {
          clientId,
          userId: pm.userId,
          invitedEmail: pm.invitedEmail,
          role: pm.role,
        },
      });
      clientMemberSeen.set(userKey, cm.id);
      console.log(`  Created ClientMember ${cm.id} for ${pm.userId || pm.invitedEmail} in client ${clientId}`);
    }

    // Create project access grant
    const clientMemberId = clientMemberSeen.get(userKey)!;
    const projectId = pm.projectId;
    await prisma.clientMemberProject.create({
      data: { clientMemberId, projectId },
    });
    console.log(`    Granted access to project ${projectId}`);
  }

  console.log("Migration complete.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run migration script**

```bash
DATABASE_URL="postgresql://ryanhaugland@localhost:5432/slushie_machine" npx tsx prisma/migrate-clients.ts
```

- [ ] **Step 3: Verify data**

```bash
psql -d slushie_machine -c 'SELECT c.id, c.name, c."workspaceId", COUNT(p.id) as projects FROM "Client" c LEFT JOIN "Project" p ON p."clientId" = c.id GROUP BY c.id, c.name, c."workspaceId";'
```

- [ ] **Step 4: Commit**

```bash
git add prisma/migrate-clients.ts
git commit -m "feat: migrate existing projects to client hierarchy"
```

---

### Task 3: Schema Cleanup — Make clientId required, drop clientName and ProjectMember

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Make clientId non-nullable on Project**

In `prisma/schema.prisma`, in the Project model, change:
```prisma
  clientId     String?
```
to:
```prisma
  clientId     String
```

And change:
```prisma
  client       Client?         @relation(fields: [clientId], references: [id], onDelete: Cascade)
```
to:
```prisma
  client       Client          @relation(fields: [clientId], references: [id], onDelete: Cascade)
```

- [ ] **Step 2: Remove clientName from Project model**

Delete this line from the Project model:
```prisma
  clientName   String
```

- [ ] **Step 3: Remove ProjectMember model and relations**

Delete the entire `ProjectMember` model block.

Remove from the `Project` model:
```prisma
  members      ProjectMember[]
```

Remove from the `User` model:
```prisma
  projectMemberships ProjectMember[]
```

- [ ] **Step 4: Generate and run migration**

```bash
npx prisma migrate dev --name finalize_client_hierarchy
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: make clientId required, drop clientName and ProjectMember"
```

---

### Task 4: Update getCurrentUser to include client hierarchy

**Files:**
- Modify: `src/lib/auth.ts:60-96`

- [ ] **Step 1: Update getCurrentUser query**

Replace the `getCurrentUser` function in `src/lib/auth.ts` with:

```typescript
export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      name: true,
      memberships: {
        include: {
          workspace: {
            include: {
              clients: {
                include: {
                  projects: {
                    orderBy: { createdAt: "desc" },
                    select: { id: true, name: true, deployUrl: true, deployStatus: true, workspaceId: true, clientId: true,
                      features: {
                        where: { parentId: null },
                        orderBy: { sortOrder: "asc" },
                        select: { id: true, status: true },
                      },
                    },
                  },
                },
                orderBy: { name: "asc" },
              },
            },
          },
        },
      },
      clientMemberships: {
        include: {
          projectAccess: { select: { projectId: true } },
        },
      },
    },
  });

  return user;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat: update getCurrentUser to include client hierarchy"
```

---

### Task 5: Client API — Create, rename, delete clients

**Files:**
- Create: `src/app/api/clients/route.ts`
- Create: `src/app/api/clients/[id]/route.ts`

- [ ] **Step 1: Create POST /api/clients**

Create `src/app/api/clients/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, workspaceId } = await req.json();
  if (!name || !workspaceId) {
    return NextResponse.json({ error: "name and workspaceId required" }, { status: 400 });
  }

  const membership = user.memberships.find((m) => m.workspaceId === workspaceId);
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
  }

  const client = await prisma.client.create({
    data: { name: name.trim(), workspaceId },
  });

  return NextResponse.json(client, { status: 201 });
}
```

- [ ] **Step 2: Create PATCH/DELETE /api/clients/[id]**

Create `src/app/api/clients/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const client = await prisma.client.update({
    where: { id },
    data: { name: name.trim() },
  });

  return NextResponse.json(client);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.client.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/clients/
git commit -m "feat: add client CRUD API endpoints"
```

---

### Task 6: Client Members API — Add, update, remove members with project access

**Files:**
- Create: `src/app/api/clients/[id]/members/route.ts`
- Create: `src/app/api/clients/[id]/members/[memberId]/route.ts`

- [ ] **Step 1: Create GET/POST /api/clients/[id]/members**

Create `src/app/api/clients/[id]/members/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const members = await prisma.clientMember.findMany({
    where: { clientId: id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      projectAccess: {
        include: { project: { select: { id: true, name: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(members);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { email, projectIds } = await req.json();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const client = await prisma.client.findUnique({
    where: { id },
    select: { workspaceId: true },
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // Find or identify user
  const targetUser = await prisma.user.findUnique({ where: { email } });

  // Check for existing client membership
  if (targetUser) {
    const existing = await prisma.clientMember.findFirst({
      where: { clientId: id, userId: targetUser.id },
    });
    if (existing) {
      return NextResponse.json({ error: "Already a member of this client" }, { status: 409 });
    }
  }

  // Create client member
  const clientMember = await prisma.clientMember.create({
    data: {
      clientId: id,
      userId: targetUser?.id || null,
      invitedEmail: targetUser ? null : email,
      projectAccess: {
        create: (projectIds || []).map((projectId: string) => ({ projectId })),
      },
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      projectAccess: {
        include: { project: { select: { id: true, name: true } } },
      },
    },
  });

  // Auto-create workspace membership if not already a member
  const userId = targetUser?.id;
  if (userId) {
    const wsExists = await prisma.workspaceMember.findFirst({
      where: { workspaceId: client.workspaceId, userId },
    });
    if (!wsExists) {
      await prisma.workspaceMember.create({
        data: { workspaceId: client.workspaceId, userId, role: "member" },
      });
    }
  }

  return NextResponse.json(clientMember, { status: 201 });
}
```

- [ ] **Step 2: Create PATCH/DELETE /api/clients/[id]/members/[memberId]**

Create `src/app/api/clients/[id]/members/[memberId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { memberId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectIds } = await req.json();
  if (!Array.isArray(projectIds)) {
    return NextResponse.json({ error: "projectIds array required" }, { status: 400 });
  }

  // Delete existing project access and recreate
  await prisma.clientMemberProject.deleteMany({
    where: { clientMemberId: memberId },
  });

  if (projectIds.length > 0) {
    await prisma.clientMemberProject.createMany({
      data: projectIds.map((projectId: string) => ({
        clientMemberId: memberId,
        projectId,
      })),
    });
  }

  const updated = await prisma.clientMember.findUnique({
    where: { id: memberId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      projectAccess: {
        include: { project: { select: { id: true, name: true } } },
      },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const { memberId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const target = await prisma.clientMember.findUnique({ where: { id: memberId } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.userId === user.id) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
  }

  await prisma.clientMember.delete({ where: { id: memberId } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/clients/
git commit -m "feat: add client member management API with project access grants"
```

---

### Task 7: Update Projects API — Use clientId instead of clientName

**Files:**
- Modify: `src/app/api/projects/route.ts`
- Modify: `src/app/api/projects/[id]/route.ts`

- [ ] **Step 1: Update GET /api/projects for access filtering**

Replace `src/app/api/projects/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceIds = user.memberships.map((m) => m.workspaceId);

  // Get workspace roles to determine if user is owner/admin
  const ownerWorkspaceIds = user.memberships
    .filter((m) => m.role === "owner" || m.role === "admin")
    .map((m) => m.workspaceId);

  // Get project IDs this user has been granted access to via client memberships
  const grantedProjectIds = user.clientMemberships.flatMap((cm) =>
    cm.projectAccess.map((pa) => pa.projectId)
  );

  const projects = await prisma.project.findMany({
    where: {
      OR: [
        // Workspace owners/admins see all projects in their workspaces
        { workspaceId: { in: ownerWorkspaceIds } },
        // Client members see only granted projects
        { id: { in: grantedProjectIds } },
      ],
    },
    include: {
      client: { select: { id: true, name: true } },
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
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, clientId } = body;

  if (!name || !clientId) {
    return NextResponse.json({ error: "name and clientId required" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, workspaceId: true },
  });
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const membership = user.memberships.find((m) => m.workspaceId === client.workspaceId);
  if (!membership) {
    return NextResponse.json({ error: "Not a member of this workspace" }, { status: 403 });
  }

  const project = await prisma.project.create({
    data: { name, clientId, workspaceId: client.workspaceId },
  });

  const { inngest } = await import("@/inngest/client");
  await inngest.send({ name: "project/create", data: { projectId: project.id } });

  return NextResponse.json(project, { status: 201 });
}
```

- [ ] **Step 2: Update PATCH /api/projects/[id] to remove clientName from allowed fields**

In `src/app/api/projects/[id]/route.ts`, change:
```typescript
  const allowed = ["name", "clientName", "themeConfig"];
```
to:
```typescript
  const allowed = ["name", "themeConfig"];
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/projects/
git commit -m "feat: update projects API for client hierarchy and access filtering"
```

---

### Task 8: Delete old project members API routes

**Files:**
- Delete: `src/app/api/projects/[id]/members/route.ts`
- Delete: `src/app/api/projects/[id]/members/[memberId]/route.ts`

- [ ] **Step 1: Delete the files**

```bash
rm -rf src/app/api/projects/\[id\]/members
```

- [ ] **Step 2: Commit**

```bash
git add -A src/app/api/projects/\[id\]/members
git commit -m "chore: remove old project members API (replaced by client members)"
```

---

### Task 9: Create ClientSettings component

**Files:**
- Create: `src/components/client-settings.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/client-settings.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { EditableText } from "./editable-text";

type Project = { id: string; name: string };

type ClientMemberData = {
  id: string;
  role: string;
  invitedEmail: string | null;
  user: { id: string; name: string; email: string } | null;
  projectAccess: { projectId: string; project: Project }[];
};

type Props = {
  client: { id: string; name: string; workspaceId: string };
  projects: Project[];
  currentUserId: string;
  onUpdate: () => void;
};

export function ClientSettings({ client, projects, currentUserId, onUpdate }: Props) {
  const [members, setMembers] = useState<ClientMemberData[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editProjectIds, setEditProjectIds] = useState<string[]>([]);

  const loadMembers = useCallback(async () => {
    const res = await fetch(`/api/clients/${client.id}/members`, { cache: "no-store" });
    if (res.ok) setMembers(await res.json());
  }, [client.id]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  async function handleRename(name: string) {
    await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    onUpdate();
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setError("");
    setInviting(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), projectIds: selectedProjectIds }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to add member");
        return;
      }
      setInviteEmail("");
      setSelectedProjectIds([]);
      loadMembers();
    } finally {
      setInviting(false);
    }
  }

  async function handleUpdateAccess(memberId: string) {
    await fetch(`/api/clients/${client.id}/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectIds: editProjectIds }),
    });
    setEditingMemberId(null);
    loadMembers();
  }

  async function handleRemove(memberId: string) {
    await fetch(`/api/clients/${client.id}/members/${memberId}`, {
      method: "DELETE",
    });
    loadMembers();
  }

  function toggleProjectId(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  return (
    <div className="max-w-2xl">
      <EditableText
        value={client.name}
        onSave={handleRename}
        className="text-xl font-semibold text-[#f1f5f9]"
        inputClassName="text-xl font-semibold text-[#f1f5f9]"
      />
      <p className="text-xs text-white/30 mb-8 mt-1">Client settings</p>

      {/* Members */}
      <div className="mb-6">
        <h3 className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-3">Members</h3>
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08]">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-white/80">
                    {m.user?.name || m.invitedEmail}
                    {m.user?.id === currentUserId && (
                      <span className="text-[0.6rem] text-white/30 ml-2">(you)</span>
                    )}
                  </div>
                  <div className="text-[0.6rem] text-white/30">
                    {m.user?.email || m.invitedEmail}
                    {!m.user && (
                      <span className="ml-2 text-yellow-400/60 bg-yellow-400/10 px-1.5 py-0.5 rounded">Pending</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (editingMemberId === m.id) {
                        setEditingMemberId(null);
                      } else {
                        setEditingMemberId(m.id);
                        setEditProjectIds(m.projectAccess.map((pa) => pa.projectId));
                      }
                    }}
                    className="text-[0.6rem] text-white/30 hover:text-white/50 transition-colors"
                  >
                    {editingMemberId === m.id ? "Cancel" : "Edit access"}
                  </button>
                  {m.user?.id !== currentUserId && (
                    <button
                      onClick={() => handleRemove(m.id)}
                      className="text-white/20 hover:text-red-400 transition-colors p-1"
                      title="Remove member"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Project access tags */}
              {editingMemberId !== m.id && m.projectAccess.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {m.projectAccess.map((pa) => (
                    <span key={pa.projectId} className="text-[0.55rem] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded">
                      {pa.project.name}
                    </span>
                  ))}
                </div>
              )}
              {editingMemberId !== m.id && m.projectAccess.length === 0 && (
                <p className="text-[0.55rem] text-white/20 mt-1">No project access</p>
              )}

              {/* Edit project access */}
              {editingMemberId === m.id && (
                <div className="mt-2 space-y-1">
                  {projects.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editProjectIds.includes(p.id)}
                        onChange={() => toggleProjectId(editProjectIds, setEditProjectIds, p.id)}
                        className="rounded border-white/20"
                      />
                      {p.name}
                    </label>
                  ))}
                  <button
                    onClick={() => handleUpdateAccess(m.id)}
                    className="mt-2 text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
          ))}
          {members.length === 0 && (
            <p className="text-[0.6rem] text-white/20">No members yet</p>
          )}
        </div>
      </div>

      {/* Add member */}
      <div>
        <h3 className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-3">Add member</h3>
        <form onSubmit={handleInvite} className="space-y-3">
          <input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="Email address"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/20"
          />
          {projects.length > 0 && (
            <div>
              <p className="text-[0.6rem] text-white/30 mb-1">Grant access to projects:</p>
              <div className="space-y-1">
                {projects.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedProjectIds.includes(p.id)}
                      onChange={() => toggleProjectId(selectedProjectIds, setSelectedProjectIds, p.id)}
                      className="rounded border-white/20"
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <button
            type="submit"
            disabled={inviting}
            className="px-4 py-2 text-xs rounded-lg bg-gradient-to-r from-red-500 to-blue-500 text-white font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {inviting ? "Adding..." : "Add member"}
          </button>
        </form>
        {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/client-settings.tsx
git commit -m "feat: add ClientSettings component with member management and project access"
```

---

### Task 10: Rewrite ProjectSidebar for three-level hierarchy

**Files:**
- Modify: `src/components/project-sidebar.tsx`
- Create: `src/components/create-client-form.tsx`

- [ ] **Step 1: Create CreateClientForm component**

Create `src/components/create-client-form.tsx`:

```tsx
"use client";

import { useState } from "react";

type Props = {
  workspaceId: string;
  onCreated: () => void;
  onCancel: () => void;
};

export function CreateClientForm({ workspaceId, onCreated, onCancel }: Props) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), workspaceId }),
    });
    setLoading(false);
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="mb-2 p-2 rounded-lg bg-white/[0.03] border border-white/[0.08] space-y-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Client name"
        className="w-full bg-transparent border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20"
        autoFocus
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 text-xs py-1 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {loading ? "Creating..." : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs py-1 px-2 rounded text-white/30 hover:text-white/50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Rewrite ProjectSidebar**

Replace the entire contents of `src/components/project-sidebar.tsx`:

```tsx
"use client";

import { useState } from "react";
import { CreateProjectForm } from "./create-project-form";
import { CreateClientForm } from "./create-client-form";
import { EditableText } from "./editable-text";

type ProjectSummary = {
  id: string;
  name: string;
  clientId: string;
  workspaceId: string;
  deployUrl: string | null;
  deployStatus: string;
  features: { id: string; status: string }[];
};

type ClientData = {
  id: string;
  name: string;
  projects: ProjectSummary[];
};

type WorkspaceMembership = {
  workspaceId: string;
  role: string;
  workspace: {
    id: string;
    name: string;
    slug: string;
    clients: ClientData[];
  };
};

type Props = {
  workspaces: WorkspaceMembership[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onDeleteClient: (id: string) => void;
  onCollapse: () => void;
  onWorkspaceSettings: (workspaceId: string) => void;
  onClientSettings: (clientId: string) => void;
  onProjectSettings: (projectId: string) => void;
  onRenameProject: (projectId: string, name: string) => void;
  onCreateWorkspace: (name: string) => Promise<string | null>;
  onRefresh: () => void;
  onLogout: () => void;
};

function ProjectItem({
  project,
  isSelected,
  onSelect,
  onDelete,
  onSettings,
  onRename,
}: {
  project: ProjectSummary;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onSettings: () => void;
  onRename: (name: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (confirmDelete) {
    return (
      <div className="px-3 py-2 rounded-lg text-sm bg-red-500/10 border border-red-500/20">
        <p className="text-[0.65rem] text-red-400 mb-2">Delete {project.name}?</p>
        <div className="flex gap-2">
          <button onClick={onDelete} className="text-[0.6rem] px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600 transition-colors">Delete</button>
          <button onClick={() => setConfirmDelete(false)} className="text-[0.6rem] px-2 py-1 rounded bg-white/[0.06] text-white/40 hover:text-white/60 transition-colors">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onSelect}
      className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer group ${
        isSelected
          ? "bg-blue-500/15 text-blue-300 border border-blue-500/20"
          : "text-white/60 hover:text-white hover:bg-white/[0.05] border border-transparent"
      }`}
    >
      <div className="flex justify-between items-center">
        <EditableText
          value={project.name}
          onSave={onRename}
          className="truncate text-inherit"
          inputClassName="text-xs text-inherit"
        />
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onSettings(); }}
            className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-white/40 transition-all p-0.5"
            title="Project settings"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
            className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 transition-all p-0.5"
            title="Delete project"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProjectSidebar({
  workspaces,
  selectedId,
  onSelect,
  onDeleteProject,
  onDeleteClient,
  onCollapse,
  onWorkspaceSettings,
  onClientSettings,
  onProjectSettings,
  onRenameProject,
  onCreateWorkspace,
  onRefresh,
  onLogout,
}: Props) {
  const [showWsForm, setShowWsForm] = useState(false);
  const [wsName, setWsName] = useState("");
  const [wsError, setWsError] = useState("");
  const [wsCreating, setWsCreating] = useState(false);
  const [showClientFormFor, setShowClientFormFor] = useState<string | null>(null);
  const [showProjectFormFor, setShowProjectFormFor] = useState<string | null>(null);
  const [confirmDeleteClient, setConfirmDeleteClient] = useState<string | null>(null);

  return (
    <aside className="w-64 border-r border-white/[0.06] bg-[#0a0f1a] p-4 min-h-screen flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-sm font-bold tracking-tight">
          <span className="bg-gradient-to-r from-red-500 to-blue-500 bg-clip-text text-transparent">
            slushie.machine
          </span>
        </h1>
        <button
          onClick={onCollapse}
          className="text-white/20 hover:text-white/40 transition-colors p-1"
          title="Collapse sidebar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4">
        {workspaces.map((membership) => (
          <div key={membership.workspace.id}>
            {/* Workspace header */}
            <div className="flex items-center justify-between mb-2">
              <div className="text-[0.6rem] uppercase tracking-widest text-white/40">
                {membership.workspace.name}
              </div>
              <button
                onClick={() => onWorkspaceSettings(membership.workspace.id)}
                className="text-white/20 hover:text-white/40 transition-colors p-0.5"
                title="Workspace settings"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </div>

            {/* Clients under this workspace */}
            <div className="space-y-3 ml-1">
              {membership.workspace.clients.map((client) => (
                <div key={client.id}>
                  {/* Client header */}
                  <div className="flex items-center justify-between mb-1 group/client">
                    <div className="text-[0.55rem] uppercase tracking-wider text-white/30 font-medium">
                      {client.name}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onClientSettings(client.id)}
                        className="opacity-0 group-hover/client:opacity-100 text-white/20 hover:text-white/40 transition-all p-0.5"
                        title="Client settings"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="3" />
                          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setConfirmDeleteClient(confirmDeleteClient === client.id ? null : client.id)}
                        className="opacity-0 group-hover/client:opacity-100 text-white/20 hover:text-red-400 transition-all p-0.5"
                        title="Delete client"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {confirmDeleteClient === client.id && (
                    <div className="px-2 py-2 mb-1 rounded-lg text-sm bg-red-500/10 border border-red-500/20">
                      <p className="text-[0.6rem] text-red-400 mb-2">Delete {client.name} and all its projects?</p>
                      <div className="flex gap-2">
                        <button onClick={() => { onDeleteClient(client.id); setConfirmDeleteClient(null); }} className="text-[0.6rem] px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600 transition-colors">Delete</button>
                        <button onClick={() => setConfirmDeleteClient(null)} className="text-[0.6rem] px-2 py-1 rounded bg-white/[0.06] text-white/40 hover:text-white/60 transition-colors">Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Projects under this client */}
                  <div className="space-y-0.5 ml-2">
                    {client.projects.map((p) => (
                      <ProjectItem
                        key={p.id}
                        project={p}
                        isSelected={p.id === selectedId}
                        onSelect={() => onSelect(p.id)}
                        onDelete={() => onDeleteProject(p.id)}
                        onSettings={() => onProjectSettings(p.id)}
                        onRename={(name) => onRenameProject(p.id, name)}
                      />
                    ))}
                  </div>

                  {/* + New project under this client */}
                  {showProjectFormFor === client.id ? (
                    <div className="ml-2 mt-1">
                      <CreateProjectForm
                        clientId={client.id}
                        onCreated={() => {
                          setShowProjectFormFor(null);
                          onRefresh();
                        }}
                        onCancel={() => setShowProjectFormFor(null)}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowProjectFormFor(client.id)}
                      className="ml-2 mt-1 w-[calc(100%-0.5rem)] px-2 py-1 text-[0.6rem] rounded border border-dashed border-white/10 text-white/30 hover:text-white/50 hover:border-white/20 transition-colors"
                    >
                      + New project
                    </button>
                  )}
                </div>
              ))}

              {membership.workspace.clients.length === 0 && (
                <p className="text-[0.6rem] text-white/15 px-2 py-1">No clients yet</p>
              )}
            </div>

            {/* + New client under this workspace */}
            {showClientFormFor === membership.workspace.id ? (
              <div className="ml-1 mt-2">
                <CreateClientForm
                  workspaceId={membership.workspace.id}
                  onCreated={() => {
                    setShowClientFormFor(null);
                    onRefresh();
                  }}
                  onCancel={() => setShowClientFormFor(null)}
                />
              </div>
            ) : (
              <button
                onClick={() => setShowClientFormFor(membership.workspace.id)}
                className="ml-1 mt-2 w-[calc(100%-0.25rem)] px-2 py-1 text-[0.6rem] rounded border border-dashed border-white/10 text-white/30 hover:text-white/50 hover:border-white/20 transition-colors"
              >
                + New client
              </button>
            )}
          </div>
        ))}
      </div>

      {/* + New workspace */}
      <button
        onClick={() => setShowWsForm(!showWsForm)}
        className="mt-4 w-full px-3 py-2 text-xs rounded-lg border border-dashed border-white/10 text-white/40 hover:text-white/60 hover:border-white/20 transition-colors"
      >
        + New workspace
      </button>

      {showWsForm && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!wsName.trim() || wsCreating) return;
            setWsError("");
            setWsCreating(true);
            try {
              const error = await onCreateWorkspace(wsName.trim());
              if (error) { setWsError(error); } else { setWsName(""); setShowWsForm(false); }
            } finally { setWsCreating(false); }
          }}
          className="mt-2 p-3 rounded-lg bg-white/[0.03] border border-white/[0.08] space-y-2"
        >
          <input value={wsName} onChange={(e) => setWsName(e.target.value)} placeholder="Workspace name" className="w-full bg-transparent border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20" autoFocus />
          {wsError && <p className="text-xs text-red-400">{wsError}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={wsCreating} className="flex-1 text-xs py-1.5 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">{wsCreating ? "Creating..." : "Create"}</button>
            <button type="button" onClick={() => { setShowWsForm(false); setWsError(""); }} className="text-xs py-1.5 px-3 rounded text-white/30 hover:text-white/50 transition-colors">Cancel</button>
          </div>
        </form>
      )}

      <button
        onClick={onLogout}
        className="mt-4 w-full px-3 py-2 text-xs rounded-lg text-white/30 hover:text-white/50 hover:bg-white/[0.04] transition-colors"
      >
        Log out
      </button>
    </aside>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/project-sidebar.tsx src/components/create-client-form.tsx
git commit -m "feat: rewrite sidebar for workspace > client > project hierarchy"
```

---

### Task 11: Update CreateProjectForm — Accept clientId instead of workspace list

**Files:**
- Modify: `src/components/create-project-form.tsx`

- [ ] **Step 1: Rewrite CreateProjectForm**

Replace `src/components/create-project-form.tsx`:

```tsx
"use client";

import { useState } from "react";

type Props = {
  clientId: string;
  onCreated: () => void;
  onCancel: () => void;
};

export function CreateProjectForm({ clientId, onCreated, onCancel }: Props) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, clientId }),
    });
    setLoading(false);
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.08] space-y-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Project name"
        className="w-full bg-transparent border border-white/10 rounded px-2 py-1 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/20"
        autoFocus
      />
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="flex-1 text-xs py-1 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">
          {loading ? "Creating..." : "Create"}
        </button>
        <button type="button" onClick={onCancel} className="text-xs py-1 px-2 rounded text-white/30 hover:text-white/50 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/create-project-form.tsx
git commit -m "feat: update CreateProjectForm to accept clientId"
```

---

### Task 12: Update PaneProject — Replace members with read-only "Visible to"

**Files:**
- Modify: `src/components/pane-project.tsx`

- [ ] **Step 1: Rewrite PaneProject**

Replace `src/components/pane-project.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { EditableText } from "./editable-text";

type Props = {
  project: {
    id: string;
    name: string;
    clientId: string;
    workspaceId: string;
    deployUrl: string | null;
    deployStatus: string;
    features: any[];
    meetings: any[];
    client?: { id: string; name: string };
  };
  onUpdate: () => void;
  onOpenPreview?: () => void;
};

type VisibleUser = {
  id: string;
  name: string;
  email: string;
};

export function PaneProject({ project, onUpdate, onOpenPreview }: Props) {
  const [visibleTo, setVisibleTo] = useState<VisibleUser[]>([]);

  const loadVisibleTo = useCallback(async () => {
    const res = await fetch(`/api/clients/${project.clientId}/members`, { cache: "no-store" });
    if (!res.ok) return;
    const members = await res.json();
    // Filter to members who have access to this specific project
    const users: VisibleUser[] = [];
    for (const m of members) {
      const hasAccess = m.projectAccess.some((pa: any) => pa.projectId === project.id);
      if (hasAccess && m.user) {
        users.push({ id: m.user.id, name: m.user.name, email: m.user.email });
      } else if (hasAccess && m.invitedEmail) {
        users.push({ id: m.id, name: m.invitedEmail, email: m.invitedEmail });
      }
    }
    setVisibleTo(users);
  }, [project.id, project.clientId]);

  useEffect(() => {
    loadVisibleTo();
  }, [loadVisibleTo]);

  async function handleRename(name: string) {
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    onUpdate();
  }

  return (
    <div>
      <EditableText
        value={project.name}
        onSave={handleRename}
        className="text-xl font-semibold text-[#f1f5f9]"
        inputClassName="text-xl font-semibold text-[#f1f5f9]"
      />
      <p className="text-xs text-white/40 mb-6 mt-1">
        {project.client?.name || ""}
      </p>

      {/* Preview button */}
      {project.deployUrl && (
        <button
          onClick={() => onOpenPreview?.()}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 mb-6 rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/70 text-sm hover:bg-white/[0.06] hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <span>Preview</span>
        </button>
      )}

      {/* Visible to */}
      <div className="mb-6">
        <h3 className="text-[0.6rem] uppercase tracking-widest text-white/30 mb-1">Visible to</h3>
        <p className="text-[0.6rem] text-white/20 mb-3">Manage access through client settings</p>
        <div className="space-y-2">
          {visibleTo.map((u) => (
            <div key={u.id} className="flex items-center px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08]">
              <div>
                <div className="text-sm text-white/80">{u.name}</div>
                <div className="text-[0.6rem] text-white/30">{u.email}</div>
              </div>
            </div>
          ))}
          {visibleTo.length === 0 && (
            <p className="text-[0.6rem] text-white/20">No one has been granted access yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/pane-project.tsx
git commit -m "feat: replace project members with read-only visible-to list"
```

---

### Task 13: Update ContextPane — Add client-settings selection type

**Files:**
- Modify: `src/components/context-pane.tsx`

- [ ] **Step 1: Update ContextPane**

Replace `src/components/context-pane.tsx`:

```tsx
"use client";

import { PaneProject } from "./pane-project";
import { PaneFeature } from "./pane-feature";
import { PaneMeeting } from "./pane-meeting";
import { WorkspaceSettings } from "./workspace-settings";
import { ClientSettings } from "./client-settings";

type Selection =
  | { type: "project" }
  | { type: "feature"; id: string }
  | { type: "meeting"; id: string }
  | { type: "workspace-settings"; workspaceId: string }
  | { type: "client-settings"; clientId: string };

type WorkspaceMembership = {
  workspaceId: string;
  role: string;
  workspace: { id: string; name: string; slug: string; clients: any[] };
};

type Props = {
  project: any;
  selection: Selection;
  onUpdate: () => void;
  workspaces?: WorkspaceMembership[];
  currentUserId?: string;
  onOpenPreview?: () => void;
};

export function ContextPane({ project, selection, onUpdate, workspaces, currentUserId, onOpenPreview }: Props) {
  if (selection.type === "workspace-settings") {
    const membership = workspaces?.find((m) => m.workspaceId === selection.workspaceId);
    if (!membership || !currentUserId) return null;
    return (
      <WorkspaceSettings
        workspace={membership.workspace}
        currentUserId={currentUserId}
        userRole={membership.role}
        onWorkspaceRenamed={onUpdate}
      />
    );
  }

  if (selection.type === "client-settings") {
    if (!currentUserId || !workspaces) return null;
    // Find the client across all workspaces
    let clientData = null;
    let clientProjects: { id: string; name: string }[] = [];
    for (const m of workspaces) {
      const found = m.workspace.clients.find((c: any) => c.id === selection.clientId);
      if (found) {
        clientData = { id: found.id, name: found.name, workspaceId: m.workspaceId };
        clientProjects = found.projects.map((p: any) => ({ id: p.id, name: p.name }));
        break;
      }
    }
    if (!clientData) return null;
    return (
      <ClientSettings
        client={clientData}
        projects={clientProjects}
        currentUserId={currentUserId}
        onUpdate={onUpdate}
      />
    );
  }

  if (selection.type === "project") {
    return <PaneProject project={project} onUpdate={onUpdate} onOpenPreview={onOpenPreview} />;
  }

  if (selection.type === "feature") {
    const allFeatures = [
      ...project.features,
      ...project.features.flatMap((f: any) => f.children || []),
    ];
    const feature = allFeatures.find((f: any) => f.id === selection.id);
    if (!feature) return <p className="text-white/30 text-sm">Feature not found.</p>;

    const parentFeature = feature.parentId
      ? project.features.find((f: any) => f.id === feature.parentId)
      : null;

    return (
      <PaneFeature
        feature={feature}
        projectId={project.id}
        deployUrl={project.deployUrl || null}
        parentTitle={parentFeature?.title || null}
        parentRoute={parentFeature?.route || null}
        onUpdate={onUpdate}
      />
    );
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

- [ ] **Step 2: Commit**

```bash
git add src/components/context-pane.tsx
git commit -m "feat: add client-settings selection type to ContextPane"
```

---

### Task 14: Update page.tsx — Wire everything together

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update Selection type and sidebar props**

In `src/app/page.tsx`, update the `Selection` type:

```typescript
type Selection =
  | { type: "project" }
  | { type: "feature"; id: string }
  | { type: "meeting"; id: string }
  | { type: "workspace-settings"; workspaceId: string }
  | { type: "client-settings"; clientId: string };
```

- [ ] **Step 2: Replace the ProjectSidebar usage**

Replace the `<ProjectSidebar ... />` block (lines 132-186) with:

```tsx
          <ProjectSidebar
            workspaces={workspaces}
            selectedId={selectedProjectId}
            onSelect={(id) => {
              setSelectedProjectId(id);
              setSelection({ type: "project" });
            }}
            onDeleteProject={async (id) => {
              await fetch(`/api/projects/${id}`, { method: "DELETE" });
              if (selectedProjectId === id) {
                setSelectedProjectId(null);
                setProject(null);
                setSelection({ type: "project" });
              }
              loadUser();
            }}
            onDeleteClient={async (id) => {
              await fetch(`/api/clients/${id}`, { method: "DELETE" });
              setSelectedProjectId(null);
              setProject(null);
              setSelection({ type: "project" });
              loadUser();
            }}
            onProjectSettings={(projectId) => {
              setSelectedProjectId(projectId);
              setSelection({ type: "project" });
            }}
            onClientSettings={(clientId) => {
              setSelectedProjectId(null);
              setProject(null);
              setSelection({ type: "client-settings", clientId });
            }}
            onRenameProject={async (projectId, name) => {
              await fetch(`/api/projects/${projectId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
              });
              loadUser();
              if (selectedProjectId === projectId) loadProject(projectId);
            }}
            onCreateWorkspace={async (name) => {
              const res = await fetch("/api/workspaces", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name }),
              });
              if (!res.ok) {
                const data = await res.json();
                return data.error || "Failed to create workspace";
              }
              await loadUser();
              return null;
            }}
            onRefresh={() => loadUser()}
            onCollapse={() => setLeftCollapsed(true)}
            onWorkspaceSettings={(workspaceId) => {
              setSelectedProjectId(null);
              setProject(null);
              setSelection({ type: "workspace-settings", workspaceId });
            }}
            onLogout={handleLogout}
          />
```

- [ ] **Step 3: Update the client-settings branch in the render**

After the `selection.type === "workspace-settings"` branch (around line 320), add a `client-settings` branch. Change:

```tsx
      ) : selection.type === "workspace-settings" ? (
```

to handle both workspace-settings and client-settings by updating the conditional to:

```tsx
      ) : selection.type === "workspace-settings" || selection.type === "client-settings" ? (
        <main className="flex-1 p-6 overflow-y-auto">
          <ContextPane
            project={null}
            selection={selection}
            onUpdate={() => {
              loadUser();
            }}
            workspaces={workspaces}
            currentUserId={user?.id}
          />
        </main>
      ) : (
```

- [ ] **Step 4: Remove the loadProjects calls**

Since projects now come from the user's workspace data via `loadUser()`, remove `loadProjects` and `projects` state entirely. Replace:
- `loadProjects()` calls with `loadUser()`
- The `projects` state is no longer needed for the sidebar (it gets projects from workspaces). However, `loadProject` for the selected project detail is still needed.

For the `AddContext` component that uses `projects`, derive it from workspaces:

```typescript
  const allProjects = workspaces.flatMap((m: any) =>
    m.workspace.clients.flatMap((c: any) => c.projects)
  );
```

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: wire client hierarchy into main page layout"
```

---

### Task 15: Build, restart, verify

**Files:** None (verification only)

- [ ] **Step 1: Build**

```bash
npx next build
```

Fix any TypeScript errors that come up. Common issues:
- Props mismatches between sidebar and page.tsx
- Missing `client` field on project responses (add to project GET query include)

- [ ] **Step 2: Restart server**

```bash
kill $(lsof -ti :3002 -sTCP:LISTEN) 2>/dev/null; sleep 1; nohup npx next start -p 3002 > /dev/null 2>&1 &
```

- [ ] **Step 3: Verify in browser**

Navigate to http://localhost:3002 (or via ngrok) and verify:
- Sidebar shows three-level hierarchy: Workspace → Client → Projects
- Can create new clients under workspaces
- Can create new projects under clients
- Clicking client gear opens client settings with member management
- Can add members to clients with project access checkboxes
- Project pane shows "Visible to" read-only list

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build issues for client hierarchy"
```
