# Workspaces, Auth & Project Rename

## Goal

Add multi-tenant workspaces with email/password authentication, member management with invite-by-email, and inline project renaming. Replaces the hardcoded `clientFirm` enum with a proper Workspace model.

## Architecture

Workspace-first approach with simple auth. New Prisma models (Workspace, User, WorkspaceMember) replace the `clientFirm` enum. Auth uses bcrypt password hashing and signed JWT in an httpOnly cookie. Next.js middleware enforces auth on all routes except `/login` and `/signup`. The sidebar dynamically groups projects by the logged-in user's workspace memberships.

## Tech Stack

- Prisma (existing) — new models + migration
- bcrypt — password hashing
- jose (or jsonwebtoken) — JWT signing/verification
- Next.js middleware — auth enforcement
- Existing React component patterns — dark theme, inline editing

---

## Data Model

### New Models

**User**
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | Primary key |
| email | String | Unique |
| name | String | Display name |
| passwordHash | String | bcrypt hash |
| createdAt | DateTime | Auto |

**Workspace**
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | Primary key |
| name | String | Display name (e.g. "w3", "isotropic") |
| slug | String | Unique, URL-safe identifier |
| createdAt | DateTime | Auto |

**WorkspaceMember**
| Field | Type | Notes |
|-------|------|-------|
| id | String (cuid) | Primary key |
| workspaceId | String | FK → Workspace |
| userId | String? | FK → User (nullable until user signs up) |
| invitedEmail | String? | Set when invited before signup |
| role | String | "owner", "admin", or "member" |
| createdAt | DateTime | Auto |
| | | Unique constraint on [workspaceId, userId] |

### Changes to Existing Models

**Project**
- Remove: `clientFirm` field and `ClientFirm` enum
- Add: `workspaceId` (String, FK → Workspace, non-nullable)

### Migration Strategy

1. Create Workspace, User, WorkspaceMember tables
2. Insert two workspace rows: name "w3" / slug "w3" and name "isotropic" / slug "isotropic"
3. Add `workspaceId` column to Project as nullable
4. Backfill: set `workspaceId` on existing projects based on `clientFirm` value
5. Make `workspaceId` non-nullable
6. Drop `clientFirm` column and enum
7. Create initial admin User (seeded via environment variables or manual insert) as owner of both workspaces

---

## Auth System

### Password Storage

bcrypt with default salt rounds (10). No plain text storage.

### Sessions

Signed JWT stored in an httpOnly, secure, sameSite=lax cookie named `session`. Token payload: `{ userId, email, iat, exp }`. Expiry: 7 days. No separate session table.

### Middleware

Next.js middleware runs on all routes. Behavior:
- Routes `/login`, `/signup`, `/api/auth/*` — pass through (no auth required)
- All other routes — verify JWT cookie. Invalid/missing → redirect to `/login`.
- API routes (except auth) — verify JWT, return 401 if invalid.

### Signup Flow

1. User submits name, email, password
2. Server hashes password, creates User row
3. Check WorkspaceMember for rows where `invitedEmail` matches the new user's email — link them by setting `userId`
4. Set JWT cookie
5. Redirect to `/`
6. If no workspace memberships exist, user sees empty state: "No workspaces yet — ask someone to invite you"

### Login Flow

1. User submits email, password
2. Server looks up User by email, verifies bcrypt hash
3. Set JWT cookie
4. Redirect to `/`

### Logout

Clear the cookie, redirect to `/login`.

---

## API Routes

### Auth Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/signup` | Create user, auto-link invites, set cookie |
| POST | `/api/auth/login` | Verify password, set cookie |
| POST | `/api/auth/logout` | Clear cookie |
| GET | `/api/auth/me` | Return current user + workspace memberships |

### Workspace Routes

| Method | Path | Description |
|--------|------|-------------|
| PATCH | `/api/workspaces/[id]` | Rename workspace (owner/admin only) |
| GET | `/api/workspaces/[id]/members` | List members |
| POST | `/api/workspaces/[id]/members` | Invite by email |
| DELETE | `/api/workspaces/[id]/members/[memberId]` | Remove member (owner/admin only) |

### Modified Existing Routes

| Route | Change |
|-------|--------|
| `GET /api/projects` | Filter to projects in user's workspaces only |
| `POST /api/projects` | Accept `workspaceId` instead of `clientFirm` |
| `PATCH /api/projects/[id]` | Already supports name update; add auth check |

---

## UI Changes

### Login & Signup Pages

- `/login` — email + password form, "Don't have an account? Sign up" link
- `/signup` — name + email + password form, "Already have an account? Log in" link
- Dark theme matching existing app aesthetic
- Minimal — no bells and whistles

### Sidebar Changes (`project-sidebar.tsx`)

- Replace hardcoded w3/isotropic groupings with dynamic workspace sections from `GET /api/auth/me`
- Each workspace header: workspace name + gear icon button
- Gear icon click: sets selection to workspace settings view (shown in main panel)
- Projects listed under their workspace (same visual treatment as current firm groupings)
- "Log out" button at bottom of sidebar

### Workspace Settings Panel (new component)

Shown in the main content area when the gear icon is clicked. Contains:

- **Workspace name** — inline editable (click to edit, blur/enter to save). Calls `PATCH /api/workspaces/[id]`.
- **Members table** — columns: Name (or invited email if not yet signed up), Email, Role. Owner/admin can remove members or change roles.
- **Invite form** — email text input + "Invite" button. Creates WorkspaceMember with `invitedEmail` set, `userId` null. Shows pending invites in the members table with a "Pending" badge.

### Project Rename (`pane-project.tsx`)

- Replace the static `<h2>` project name with an inline editable field
- Click to edit, blur/enter to save
- Calls existing `PATCH /api/projects/[id]` with `{ name: newName }`
- Callback to refresh project data after save

### Add Context Changes (`add-context.tsx`)

- Project selector dropdown filtered to only show projects in user's workspaces
- No other changes needed

---

## Security Considerations

- Passwords hashed with bcrypt (never stored in plain text)
- JWT in httpOnly cookie (not accessible to JavaScript)
- All workspace/project mutations verify the user is a member of the relevant workspace
- Member management (invite, remove, role change) restricted to owner/admin roles
- Invite-by-email does not leak whether an email is already registered
- API routes validate workspace membership before returning project data

---

## Out of Scope

- OAuth / social login
- Email notifications for invites
- Workspace creation UI (initial workspaces seeded from migration; new workspaces created manually in DB until creation UI is added)
- Password reset flow
- Profile/account settings page
