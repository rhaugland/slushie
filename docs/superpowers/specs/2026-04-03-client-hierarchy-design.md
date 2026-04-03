# Client Hierarchy Restructuring

## Goal

Introduce a Client layer between Workspace and Project so the hierarchy becomes **Workspace → Client → Project**. Users are added at the client level and granted access to specific projects under that client.

## Current State

- Workspace → Projects (flat, with `clientName` string on Project)
- `ProjectMember` model controls per-project access
- `WorkspaceMember` controls workspace-level access
- Sidebar shows: Workspace header → Projects

## New Data Model

### Client (new)

| Field       | Type     | Notes                            |
|-------------|----------|----------------------------------|
| id          | String   | cuid, PK                         |
| name        | String   | e.g. "Oterra"                    |
| workspaceId | String   | FK to Workspace                  |
| createdAt   | DateTime | default now()                    |

Relations: belongs to Workspace, has many Projects, has many ClientMembers.

### ClientMember (new)

| Field        | Type    | Notes                                  |
|--------------|---------|----------------------------------------|
| id           | String  | cuid, PK                               |
| clientId     | String  | FK to Client                           |
| userId       | String? | FK to User (null if pending invite)     |
| invitedEmail | String? | set when user hasn't signed up yet      |
| role         | String  | default "member"                        |
| createdAt    | DateTime| default now()                           |

Relations: belongs to Client, belongs to User (optional), has many ClientMemberProjects.

Unique constraint: (clientId, userId).

**Side effect:** When a ClientMember is created, if the user is not already a WorkspaceMember of the client's workspace, automatically create a WorkspaceMember with role "member".

### ClientMemberProject (new, join table)

| Field          | Type   | Notes              |
|----------------|--------|--------------------|
| id             | String | cuid, PK           |
| clientMemberId | String | FK to ClientMember |
| projectId      | String | FK to Project      |

Unique constraint: (clientMemberId, projectId).

This controls which projects a client member can see. No entry = no access.

### Project (modified)

- **Remove:** `clientName` (String)
- **Remove:** `members` relation to ProjectMember
- **Add:** `clientId` (String, FK to Client)
- Keep: `workspaceId` (denormalized for query convenience, must match client's workspaceId)

### ProjectMember (removed)

Drop this model entirely. Project visibility is controlled through ClientMemberProject.

## Access Rules

- **Workspace owners/admins:** See all clients and all projects in the workspace
- **Client members:** See only the projects they've been explicitly granted via ClientMemberProject
- **New projects:** Hidden from existing client members by default. Must be granted manually.

## API Endpoints

### New

- `POST /api/clients` — Create client under a workspace. Body: `{ name, workspaceId }`. Returns created client.
- `GET /api/clients/[id]/members` — List client members with their granted projects.
- `POST /api/clients/[id]/members` — Add user to client. Body: `{ email, projectIds }`. Auto-creates WorkspaceMember if needed. Returns created member.
- `PATCH /api/clients/[id]/members/[memberId]` — Update project access. Body: `{ projectIds }`. Replaces current project grants.
- `DELETE /api/clients/[id]/members/[memberId]` — Remove user from client. Does NOT remove their WorkspaceMember (they may belong to other clients).

### Modified

- `GET /api/projects` — Filter by access: workspace owners see all; client members see only granted projects.
- `POST /api/projects` — Body changes from `{ name, clientName, workspaceId }` to `{ name, clientId }`. workspaceId derived from client. Does NOT auto-grant to existing client members.
- `GET /api/projects/[id]` — Return 403 if user lacks access (not workspace owner and no ClientMemberProject entry).

### Removed

- `GET /api/projects/[id]/members` — replaced by client member management
- `POST /api/projects/[id]/members` — replaced by client member management
- `DELETE /api/projects/[id]/members/[memberId]` — replaced by client member management

## Sidebar UI

Three-level hierarchy:

```
WORKSPACE NAME              [gear]
  + New client

  CLIENT NAME               [gear] [trash]
    Project Alpha           [pencil] [gear] [trash]
    Project Beta            [pencil] [gear] [trash]
    + New project

  CLIENT NAME 2             [gear] [trash]
    Project Gamma           [pencil] [gear] [trash]
    + New project

+ New workspace
Log out
```

- Workspace header: gear icon opens workspace settings (unchanged)
- Client subheader: gear icon opens client settings pane, trash deletes client
- Project items: pencil icon for inline rename, gear opens project settings, trash deletes
- "+ New client" button under each workspace header
- "+ New project" button under each client

## Client Settings Pane

Opened when clicking gear icon on a client in the sidebar.

- Editable client name at top
- Members section: list of members, each showing name/email + which projects they have access to (as tags/badges)
- Add member form: email input + checklist of client's projects to grant
- Edit member: click to update project access via checkboxes
- Remove member button

## Project Pane Changes

- Remove the "Members" section with invite form
- Replace with "Visible to" — a read-only list of client members who have access to this specific project
- Text: "Manage access through client settings"

## Migration Plan

1. Create `Client` table
2. For each unique `(workspaceId, clientName)` pair in existing projects, create a Client record
3. Add `clientId` column to Project as nullable, backfill from newly created Client records matching on workspaceId + clientName
4. Make `clientId` non-nullable, drop `clientName`
5. Create `ClientMember` and `ClientMemberProject` tables
6. Migrate existing ProjectMember records: for each ProjectMember, find the project's client, create a ClientMember (if not already existing for that client+user), then create a ClientMemberProject for the specific project
7. Drop `ProjectMember` table

## Components Affected

- `project-sidebar.tsx` — complete rewrite: three-level hierarchy with client grouping
- `create-project-form.tsx` — select client instead of workspace, remove clientName input
- `pane-project.tsx` — replace members section with read-only "Visible to" list
- `context-pane.tsx` — add client-settings selection type
- `page.tsx` — add client settings selection, create client handler, wire new callbacks
- New: `client-settings.tsx` — client name editing, member management with project access checkboxes
- New: `create-client-form.tsx` — inline form for creating a client under a workspace
