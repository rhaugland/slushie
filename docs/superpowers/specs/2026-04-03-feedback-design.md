# Feedback Feature — Design Spec

## Goal

Add an embeddable feedback widget that customers can add to their apps. End-users submit free-text feedback ("What could be better?"), AI analyzes it into a feature request (title, description, priority, major/minor), and the result appears in both a dedicated Feedback pane and the Wishlist.

## Architecture

Three components: (1) a public-facing embeddable JS widget authenticated by project API key, (2) a server-side AI processing pipeline via Inngest, (3) a Feedback pane in the sidebar for triage.

Feedback items flow: Widget submission → FeedbackItem record → Inngest AI analysis → WishlistItem creation (source: "feedback") → visible in both Feedback pane and Wishlist.

## Data Model

### New: `FeedbackItem` model

```prisma
model FeedbackItem {
  id            String   @id @default(cuid())
  projectId     String
  text          String   @db.Text
  title         String?
  description   String?  @db.Text
  priority      String?  // high | medium | low
  featureType   String?  // major | minor
  status        String   @default("pending") // pending | reviewed | dismissed
  wishlistItemId String?
  createdAt     DateTime @default(now())
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@index([status])
}
```

### Modified: `Project` model

Add field:
```prisma
  apiKey        String?  @unique
```

Add relation:
```prisma
  feedbackItems FeedbackItem[]
```

### Existing: `WishlistItem`

Already supports `source: "feedback"`. No schema changes needed. When AI processes feedback, a WishlistItem is created with `source: "feedback"` and linked back via the FeedbackItem's `wishlistItemId`.

## Embeddable Widget

### Delivery

- Served as a static JS file at `/feedback.js` (or `/api/feedback/widget.js`)
- Loaded via: `<script src="https://yourapp.com/feedback.js?key=PROJECT_API_KEY"></script>`
- Self-contained — no dependencies, no iframe, renders directly on the host page

### Behavior

1. On load, renders a slim bar at the top of the page: "What could be better? **Let us know**"
2. Clicking "Let us know" expands an inline textarea + submit button below the bar
3. On submit, POSTs to `/api/feedback` with `{ apiKey, text }`
4. Shows "Thanks for your feedback!" confirmation
5. Collapses back to the bar after 2 seconds

### Styling

- Minimal, dark-themed bar that sits at the very top of the page
- Uses shadow DOM or scoped styles to avoid conflicts with host page CSS
- Fixed position at top of viewport
- Small enough to not be intrusive

## API Endpoints

### POST `/api/feedback` (Public)

- No auth required — validated by API key
- Request: `{ apiKey: string, text: string }`
- Validates API key maps to a project
- Creates FeedbackItem with status "pending"
- Triggers Inngest event `feedback/analyze` with `{ feedbackItemId }`
- Returns `{ ok: true }`

### GET `/api/feedback?projectId=xxx` (Authenticated)

- Requires auth via `getCurrentUser`
- Query params: `projectId` (required), `status` (optional, defaults to all)
- Returns FeedbackItems for the project, ordered by createdAt desc

### PATCH `/api/feedback/[id]` (Authenticated)

- Requires auth
- Allowed fields: `status` (to dismiss)
- Returns updated FeedbackItem

### GET `/api/projects/[id]/embed-key` (Authenticated)

- Returns the project's API key
- If none exists, generates one (crypto.randomBytes(16).toString("hex"))
- Returns `{ apiKey, embedCode }` where embedCode is the ready-to-copy script tag

## AI Processing (Inngest)

### Event: `feedback/analyze`

**Step 1: Analyze feedback text**
- Load FeedbackItem by ID
- Call Claude with a prompt that extracts:
  - `title`: short feature name
  - `description`: expanded description of what the user wants
  - `priority`: high/medium/low based on urgency/impact signals
  - `featureType`: "major" or "minor" based on scope
- Use structured output (zod schema)

**Step 2: Save analysis + create WishlistItem**
- Update FeedbackItem with extracted `title`, `description`, `priority`, `featureType`
- Create WishlistItem with:
  - `title`, `description`, `priority` from analysis
  - `source: "feedback"`
  - `clientId` from project's client
  - `projectId` from feedback item
  - `status: "pending"`
- Update FeedbackItem: set `wishlistItemId`, set `status` to "reviewed"

### Prompt

System: "You analyze user feedback and extract feature requests. Output JSON with title, description, priority (high/medium/low), and featureType (major/minor). A major feature is a new top-level capability. A minor feature is an improvement to an existing capability."

User: the raw feedback text

### Schema

```typescript
const feedbackAnalysisSchema = z.object({
  title: z.string(),
  description: z.string(),
  priority: z.enum(["high", "medium", "low"]),
  featureType: z.enum(["major", "minor"]),
});
```

## Feedback Pane (Sidebar UI)

### Navigation

- New sidebar button "Feedback" after Wishlist
- Selection type: `{ type: "feedback" }`
- Icon: speech bubble or message icon

### Pane Layout

**Header section:**
- "Feedback" title
- Project selector dropdown (shows all projects across workspaces)

**Embed code section (collapsible):**
- Shows the `<script>` tag for the selected project
- "Copy" button
- Generated on first view via GET `/api/projects/[id]/embed-key`

**Feedback list:**
- Each item shows:
  - Raw feedback text (truncated)
  - AI-extracted feature title (if analyzed)
  - Priority badge (color-coded)
  - Feature type badge (major/minor)
  - Timestamp
  - Status indicator (pending = processing spinner, reviewed = ready for action)
- Expandable: click to see full text + full AI analysis
- Actions per item:
  - "Move to Production" — opens existing MoveToProductionModal, pre-filled with AI-extracted data
  - "Dismiss" — PATCH status to "dismissed"

**Dismissed section:**
- Collapsible, shows dismissed items
- "Restore" action to set back to "reviewed"

### Polling

- Poll GET `/api/feedback?projectId=xxx` every 3 seconds while any items have status "pending" (same pattern as Notes pane)

## File Structure

### New Files
- `prisma/migrations/XXXXXX_feedback/migration.sql` (auto-generated)
- `src/app/api/feedback/route.ts` — GET + POST
- `src/app/api/feedback/[id]/route.ts` — PATCH
- `src/app/api/projects/[id]/embed-key/route.ts` — GET
- `src/inngest/analyze-feedback.ts` — Inngest function
- `src/prompts/feedback-analyzer.ts` — Claude prompt
- `src/components/pane-feedback.tsx` — Feedback pane
- `public/feedback.js` — Embeddable widget script

### Modified Files
- `prisma/schema.prisma` — Add FeedbackItem model, add apiKey to Project
- `src/lib/schemas.ts` — Add feedbackAnalysisSchema
- `src/app/api/inngest/route.ts` — Register analyzeFeedback function
- `src/components/project-sidebar.tsx` — Add Feedback button
- `src/app/page.tsx` — Add feedback selection type + PaneFeedback render
