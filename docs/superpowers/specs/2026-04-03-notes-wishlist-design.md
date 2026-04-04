# Notes + Wishlist Design Spec

## Goal

Add two new top-level features to slushie-machine: **Notes** (capture meetings and written notes per client/project) and **Wishlist** (universal intake queue for all feature requests). Notes feeds extracted features into Wishlist. From Wishlist, items are triaged into production as major or minor features.

## Architecture

```
Input Sources                  Funnel              Output
─────────────                  ──────              ──────
Live Video Meeting ──┐
Audio Upload ────────┤
Text Note ───────────┼──→ Notes ──→ AI Extract ──→ Wishlist ──→ Move to Production
Handwritten Upload ──┤                                          (major or minor feature)
(Future: Customer ───┘
 Feedback Portal)
```

Two new top-level sidebar nav items: **Notes** and **Wishlist**. Both sit alongside the existing Team and Changelog buttons.

## Data Model Changes

### Extend `Meeting` model

Add fields to the existing Meeting model:

```prisma
model Meeting {
  id          String              @id @default(cuid())
  projectId   String?             // NOW NULLABLE — meetings can be client-level
  clientId    String?             // NEW — optional client association
  type        String              @default("audio_upload") // audio_upload | live_video | text_note | handwritten
  audioUrl    String?             // NOW NULLABLE — text notes and handwritten don't have audio
  imageUrl    String?             // NEW — for handwritten note image uploads
  textContent String?             @db.Text // NEW — for typed text notes
  summary     String?             @db.Text // NEW — AI-generated summary
  transcript  String?             @db.Text
  status      String              @default("uploading")
  createdAt   DateTime            @default(now())
  project     Project?            @relation(fields: [projectId], references: [id], onDelete: Cascade)
  client      Client?             @relation(fields: [clientId], references: [id], onDelete: Cascade)
  suggestions MeetingSuggestion[]

  @@index([projectId])
  @@index([clientId])
}
```

Changes from current schema:
- `projectId` becomes nullable (meetings can be client-level without a specific project)
- `clientId` added as optional field
- `audioUrl` becomes nullable (text notes don't have audio)
- `type` field added to distinguish input method
- `imageUrl` added for handwritten note photos
- `textContent` added for typed notes
- `summary` added for AI-generated summaries
- `Client` model gets a `meetings Meeting[]` relation

### New `WishlistItem` model

```prisma
model WishlistItem {
  id                   String   @id @default(cuid())
  title                String
  description          String   @db.Text
  priority             String?  // high | medium | low
  source               String   @default("meeting") // meeting | manual | feedback (future)
  status               String   @default("pending") // pending | moved | dismissed
  clientId             String
  projectId            String?  // nullable — may not be project-specific yet
  meetingId            String?  // tracks origin meeting
  meetingSuggestionId  String?  // tracks origin suggestion
  featureId            String?  // set when moved to production
  createdAt            DateTime @default(now())
  client               Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)
  project              Project? @relation(fields: [projectId], references: [id], onDelete: Cascade)
  meeting              Meeting? @relation(fields: [meetingId], references: [id], onDelete: SetNull)

  @@index([clientId])
  @@index([projectId])
  @@index([status])
}
```

### New `LiveRoom` model

```prisma
model LiveRoom {
  id        String   @id @default(cuid())
  meetingId String   @unique
  roomCode  String   @unique // short code for shareable link
  status    String   @default("waiting") // waiting | active | ended
  createdAt DateTime @default(now())
  meeting   Meeting  @relation(fields: [meetingId], references: [id], onDelete: Cascade)
}
```

### Relation additions

- `Client` gets: `meetings Meeting[]`, `wishlistItems WishlistItem[]`
- `Project` gets: `wishlistItems WishlistItem[]`
- `Meeting` gets: `wishlistItems WishlistItem[]`, `liveRoom LiveRoom?`

## Notes Tab

### Navigation

Top-level sidebar button labeled "Notes", same pattern as "Team". Clicking it sets selection to `{ type: "notes" }`.

### View Layout

1. **Client selector** — dropdown or tabs at top to pick a client from the user's workspaces
2. **"New Note" button** — dropdown with four options:
   - Start Live Meeting (creates room, shows video UI)
   - Upload Recording (existing audio upload flow)
   - Write Text Note (opens text editor)
   - Upload Handwritten Notes (file picker for images/PDFs)
3. **Notes list** — grouped by project within the selected client, ordered by date descending. Each note card shows:
   - Type icon (video, mic, pen, camera)
   - Date
   - Summary (first 2 lines) or "Processing..." if still transcribing
   - Number of extracted features
4. **Expanded note** — clicking a note shows:
   - Full AI summary
   - Audio player (if audio type)
   - Collapsible transcript
   - Image viewer (if handwritten type)
   - List of extracted features with links to their wishlist items

### New Note Flows

**Upload Recording:** Same as existing meeting upload — select audio file, pick project (optional), upload to `/api/meetings` with `type: "audio_upload"`. Inngest transcribes, summarizes, extracts features, creates WishlistItems.

**Write Text Note:** Text editor with client/project selector. On save, POST to `/api/meetings` with `type: "text_note"` and `textContent`. Inngest summarizes and extracts features, creates WishlistItems.

**Upload Handwritten Notes:** File picker for images. Upload to storage, POST to `/api/meetings` with `type: "handwritten"` and `imageUrl`. Inngest uses Claude vision to read the image, then summarizes and extracts features, creates WishlistItems.

**Start Live Meeting:** See Live Video Meeting section below.

## Live Video Meeting (WebRTC)

### Flow

1. User clicks "Start Live Meeting" in Notes
2. Frontend POSTs to `/api/meetings/live` — creates a Meeting record (type: `"live_video"`) and a LiveRoom with a generated `roomCode`
3. User sees the video call UI with their own camera and a shareable link: `/meet/[roomCode]`
4. User shares the link with the other person
5. Guest opens the link — no account needed. Simple page with a "Join" button.
6. WebRTC peer-to-peer connection established via a simple signaling mechanism (WebSocket or polling-based through the server)
7. Audio captured via `MediaRecorder` on the host's browser, chunked every 30 seconds
8. Each chunk uploaded to `/api/meetings/[id]/chunks` as it's recorded
9. When either party ends the call:
   - LiveRoom status set to `"ended"`
   - Server stitches audio chunks into a single file, sets as Meeting's `audioUrl`
   - Inngest transcription + summarization + feature extraction pipeline runs

### Signaling

WebRTC requires a signaling channel to exchange SDP offers/answers and ICE candidates. Use a simple polling-based approach through the API:

- `POST /api/meetings/live/[roomCode]/signal` — post a signaling message
- `GET /api/meetings/live/[roomCode]/signal` — poll for new messages

This avoids WebSocket infrastructure. Each participant polls every 500ms during connection setup. Once the peer connection is established, signaling stops.

### Guest Page

Route: `/meet/[roomCode]`

Minimal page — no sidebar, no auth required. Shows:
- Meeting title / "Slushie Meeting"
- Video feeds (local + remote)
- Mute / camera toggle / end call buttons
- "Powered by slushie.machine" branding

### Audio Chunking

Host browser only (the person who created the meeting):
- `MediaRecorder` with `timeslice: 30000` (30 second chunks)
- Each `ondataavailable` event uploads the blob to `/api/meetings/[id]/chunks`
- Chunks stored on disk in `uploads/chunks/[meetingId]/` numbered sequentially
- At meeting end, chunks concatenated into a single audio file

## Wishlist Tab

### Navigation

Top-level sidebar button labeled "Wishlist", same pattern as Notes. Clicking it sets selection to `{ type: "wishlist" }`.

### View Layout

1. **Filter bar** — filter by: client (dropdown), project (dropdown, filtered by selected client), source type (meeting/manual), priority (high/medium/low)
2. **"Add Item" button** — manually add a wishlist item with title, description, client, project
3. **Pending items list** — cards showing:
   - Title and description (first 2 lines)
   - Source label: "From meeting on Apr 2" or "Manual entry"
   - Priority badge (color-coded: red=high, yellow=medium, gray=low)
   - Client and project tags
   - Action buttons: "Move to Production", "Dismiss"
4. **Dismissed section** — collapsible, shows dismissed items with "Restore" button

### Move to Production Modal

When "Move to Production" is clicked:

1. Modal opens, pre-filled with the item's title and description
2. **Editable fields:** title, description
3. **Feature type selector:** Major or Minor
4. **If Minor:** dropdown to select which project and which major feature to place it under
5. **If Major:** dropdown to select which project. Toggle for "Auto-generate sub-features" (triggers the existing AI suggestion flow from AddMajorFeature)
6. **Confirm button:** Creates the feature, updates WishlistItem status to "moved", sets `featureId`. If auto-generate is on, runs the AI suggestion + build flow.

## AI Processing Pipeline

All note types converge into the same Inngest pipeline. New event: `notes/process`.

### Steps

1. **Content extraction** (conditional on type):
   - `audio_upload` or `live_video`: Run existing transcription (Deepgram/Whisper). Result → `transcript`
   - `text_note`: `textContent` used directly as transcript
   - `handwritten`: Send `imageUrl` to Claude vision with prompt "Extract all text from this handwritten note." Result → `transcript`

2. **Summarization**: Send transcript to Claude with prompt: "Summarize this meeting/note into key points and action items. Keep it concise — 3-8 bullet points." Result → `summary`

3. **Feature extraction**: Send transcript to Claude with prompt similar to existing `MeetingSuggestion` extraction. Returns JSON array of `{ title, description, priority, suggestedParentTitle }`. Each result creates both a `MeetingSuggestion` (for the meeting pane) and a `WishlistItem` (for the wishlist). The `clientId` for the WishlistItem is resolved from either the Meeting's `clientId` directly, or from `meeting.project.clientId` if only `projectId` is set.

4. **Update status**: Set Meeting status to `"ready"`.

### Reuse

The existing Inngest function `meeting/transcribe` handles step 1 for audio. We extend it or create a wrapper `notes/process` function that handles all types and adds steps 2-3.

## API Routes

### Notes

- `GET /api/notes?clientId=X` — list meetings for a client, grouped by project
- `POST /api/meetings` — extended to accept `type`, `clientId`, `textContent`, `imageUrl`
- `POST /api/meetings/live` — create live meeting room, returns room code and meeting link
- `GET /api/meetings/live/[roomCode]` — get room info (for guest page)
- `POST /api/meetings/live/[roomCode]/signal` — post signaling message
- `GET /api/meetings/live/[roomCode]/signal` — poll for signaling messages
- `POST /api/meetings/[id]/chunks` — upload audio chunk
- `POST /api/meetings/[id]/end` — end live meeting, trigger processing

### Wishlist

- `GET /api/wishlist?clientId=X&projectId=Y&status=pending` — list wishlist items with filters
- `POST /api/wishlist` — create manual wishlist item
- `PATCH /api/wishlist/[id]` — update item (edit title/description, dismiss, restore)
- `POST /api/wishlist/[id]/move` — move to production (accepts: `featureType`, `projectId`, `parentFeatureId`, `autoGenerate`, edited `title`/`description`)

## Components

### New Components

- `pane-notes.tsx` — Notes tab view (client selector, notes list, note detail)
- `pane-wishlist.tsx` — Wishlist tab view (filters, items list, dismiss section)
- `new-note-modal.tsx` — "New Note" dropdown/modal with type options
- `text-note-editor.tsx` — Simple text editor for typed notes
- `live-meeting.tsx` — WebRTC video call UI (host view)
- `meet-guest.tsx` — Guest video call page (no auth)
- `move-to-production-modal.tsx` — Modal for triaging wishlist items to features
- `wishlist-card.tsx` — Individual wishlist item card

### Modified Components

- `project-sidebar.tsx` — Add "Notes" and "Wishlist" nav buttons
- `page.tsx` — Add selection types for `"notes"` and `"wishlist"`, render new panes

## File Upload / Storage

Audio chunks and handwritten note images stored in `uploads/` directory (same pattern as existing audio uploads). Structure:

```
uploads/
  chunks/[meetingId]/001.webm, 002.webm, ...
  notes/[meetingId].webm (stitched final audio)
  handwritten/[meetingId].jpg
```

## What Stays the Same

- Existing project-level meetings continue working on the meeting pane
- The `MeetingSuggestion` accept/dismiss flow on `pane-meeting.tsx` is unchanged
- Feature building pipeline (Inngest + Claude Code) is unchanged
- The "Add Major Feature" AI suggestion flow is reused when moving major items from wishlist
- All existing API routes are untouched
