# Client Portal MVP — Design Spec

## Goal

Add a client-facing portal at `/portal` where invited clients can log in, view their project previews in an iframe, browse and vote on wishlist items, and submit feedback — all within a clean, branded experience separate from the internal app.

## Architecture

A `/portal` route group within the existing Next.js app. Clients authenticate using the existing JWT system, but authorization checks `clientMemberships` instead of `workspaceMemberships`. The portal uses a dedicated layout (no internal sidebar/nav) with a minimal header and tab navigation. All portal API routes live under `/api/portal/`.

Clients are invited via the existing ClientMember invite/claim flow (invitedEmail → userId on signup). Project-level access is controlled by the existing ClientMemberProject model.

## Data Model

### New: `WishlistVote` model

```prisma
model WishlistVote {
  id              String   @id @default(cuid())
  wishlistItemId  String
  clientMemberId  String
  vote            Int      // +1 or -1
  createdAt       DateTime @default(now())

  wishlistItem    WishlistItem   @relation(fields: [wishlistItemId], references: [id], onDelete: Cascade)
  clientMember    ClientMember   @relation(fields: [clientMemberId], references: [id], onDelete: Cascade)

  @@unique([wishlistItemId, clientMemberId])
  @@index([wishlistItemId])
}
```

### Modified: `WishlistItem` model

Add relation:
```prisma
  votes  WishlistVote[]
```

### Modified: `ClientMember` model

Add relation:
```prisma
  wishlistVotes  WishlistVote[]
```

### Modified: `FeedbackItem` model

Add optional field to track portal submissions:
```prisma
  clientMemberId  String?
  clientMember    ClientMember? @relation(fields: [clientMemberId], references: [id])
```

### Modified: `ClientMember` model (additional)

Add relation:
```prisma
  feedbackItems  FeedbackItem[]
```

No other schema changes. Everything else leverages existing models: ClientMember (invite/claim flow), ClientMemberProject (project access), WishlistItem, FeedbackItem, Project (deployUrl).

## Client Auth

### Login

- Clients hit `/portal/login` — a dedicated login page styled with the slushie.machine branding (gradient, dark theme) but distinct from the internal login
- POST `/api/portal/login` validates credentials against the User table, then checks that the user has at least one ClientMember record
- Returns the same JWT cookie used by the internal app
- On success, redirects to `/portal`

### Auth Helper

- New `getCurrentClientUser()` function in `src/lib/auth.ts`
- Reads the JWT cookie (same as `getCurrentUser`)
- Returns the user with their `clientMemberships` (including `projectAccess`)
- Returns null if the user has no client memberships (even if they're a valid internal user)
- All `/api/portal/*` routes use this instead of `getCurrentUser`

### Route Protection

- `/portal` pages check auth client-side: if no session, redirect to `/portal/login`
- API routes return 401 if `getCurrentClientUser()` returns null
- Project-level routes verify the client has access to the specific project via ClientMemberProject

## Pages

### `/portal/login` — Client Login

- Email + password form
- Slushie.machine branding (gradient title, dark bg)
- Tagline: "Welcome back" or similar client-facing copy
- Error display for invalid credentials or no client access
- No "sign up" link — clients are invited only

### `/portal` — Project List

- Grid of project cards the client has access to
- Each card shows: project name, client name
- Click navigates to `/portal/[projectId]`
- If client has access to only one project, auto-redirect to it

### `/portal/[projectId]` — Project View

Tab-based layout with three tabs:

**Preview tab (default):**
- Full-width iframe pointing to the project's `deployUrl` with `?isolate=true` appended
- Iframe takes up most of the viewport height
- "Open in new tab" link below the iframe as fallback
- If no deployUrl exists, show a "Preview not available yet" message

**Wishlist tab:**
- List of WishlistItems for the project
- Each item shows: title, description (truncated), priority badge (color-coded), status
- Up/down vote buttons per item with current vote count
- Client's own vote highlighted
- Sorted by vote count descending, then createdAt descending
- Voting is a toggle: click again to remove vote, click opposite to switch

**Feedback tab:**
- Text input area: "What could be better?"
- Submit button
- On submit, POSTs to `/api/portal/projects/[id]/feedback`
- Shows "Thanks for your feedback!" confirmation
- Below the input: list of the client's own previous feedback submissions
- Each shows: raw text, AI-extracted title (if analyzed), priority badge, status (pending spinner / reviewed)

## API Endpoints

### POST `/api/portal/login`

- Request: `{ email, password }`
- Validates credentials against User table
- Checks user has at least one ClientMember record
- Sets JWT cookie (same format as internal login)
- Returns `{ ok: true }`
- Error: 401 with `{ error: "Invalid credentials" }` or `{ error: "No client access" }`

### GET `/api/portal/projects`

- Auth: `getCurrentClientUser()`
- Returns projects the client has access to via ClientMemberProject
- Response: `{ projects: [{ id, name, clientName }] }`

### GET `/api/portal/projects/[id]/preview`

- Auth: `getCurrentClientUser()` + project access check
- Returns `{ deployUrl }` for the project
- Used by the frontend to set the iframe src

### GET `/api/portal/projects/[id]/wishlist`

- Auth: `getCurrentClientUser()` + project access check
- Returns WishlistItems for the project with vote counts and client's own vote
- Response: `{ items: [{ id, title, description, priority, status, voteCount, clientVote }] }`
- `voteCount` = sum of all votes, `clientVote` = the current client's vote (+1, -1, or null)

### POST `/api/portal/wishlist/[id]/vote`

- Auth: `getCurrentClientUser()`
- Request: `{ vote: 1 | -1 | 0 }` (0 removes vote)
- Upserts WishlistVote (unique on wishlistItemId + clientMemberId)
- If vote is 0, deletes the existing vote
- Returns `{ voteCount, clientVote }`

### GET `/api/portal/projects/[id]/feedback`

- Auth: `getCurrentClientUser()` + project access check
- Returns FeedbackItems where `clientMemberId` matches the current client
- Response: `{ items: [{ id, text, title, priority, featureType, status, createdAt }] }`

### POST `/api/portal/projects/[id]/feedback`

- Auth: `getCurrentClientUser()` + project access check
- Request: `{ text }`
- Creates FeedbackItem with projectId, clientMemberId, text, status "pending"
- Triggers `feedback/analyze` Inngest event (reuses existing pipeline)
- Returns `{ ok: true }`

## Portal Layout

- Dark theme consistent with the main app (`bg-[#080d19]`)
- Minimal header: slushie.machine logo (small), project name (when in a project), user menu (logout)
- Tab bar below header for project views: Preview | Wishlist | Feedback
- No internal sidebar, no workspace/client navigation
- Mobile-responsive

## File Structure

### New Files
- `src/app/portal/login/page.tsx` — Client login page
- `src/app/portal/page.tsx` — Project list
- `src/app/portal/[projectId]/page.tsx` — Project view with tabs
- `src/app/portal/layout.tsx` — Portal layout (no sidebar)
- `src/lib/portal-auth.ts` — `getCurrentClientUser()` helper
- `src/app/api/portal/login/route.ts` — Client login endpoint
- `src/app/api/portal/projects/route.ts` — List client projects
- `src/app/api/portal/projects/[id]/preview/route.ts` — Get deploy URL
- `src/app/api/portal/projects/[id]/wishlist/route.ts` — Wishlist items with votes
- `src/app/api/portal/wishlist/[id]/vote/route.ts` — Cast vote
- `src/app/api/portal/projects/[id]/feedback/route.ts` — GET + POST feedback
- `prisma/migrations/XXXXXX_wishlist_votes/migration.sql` — Auto-generated

### Modified Files
- `prisma/schema.prisma` — Add WishlistVote model, add relations to WishlistItem and ClientMember
