# Notes Pane Redesign

## Summary

Rewrite pane-notes.tsx to split the current monolithic notes view into three clear modes: a tabbed interface with "View Notes" (clean read-only list) and "Review Suggestions" (AI-extracted feature review pipeline), plus a "+ Take Notes" button that opens a modal with three capture options (Write, Upload, Meet). Purely frontend — no backend or API changes.

## Layout

```
┌─────────────────────────────────────────────────┐
│ [← Dashboard]                                    │
│                                                  │
│  Notes                                           │
│  ┌──────────┬──────────┬───────────────────┐    │
│  │View Notes│ Review   │                   │    │
│  │          │Suggestions│  [+ Take Notes]   │    │
│  └──────────┴──────────┴───────────────────┘    │
│                                                  │
│  (content for active tab)                        │
└─────────────────────────────────────────────────┘
```

- Two tabs on the left: View Notes, Review Suggestions
- "+ Take Notes" button on the right opens a modal
- Tab content renders below the tab bar

## View Notes Tab

Clean read-only list of all notes for the selected project. Each note card shows:

- **Type badge** — Written / Uploaded / Meeting, with corresponding icon (text, mic, video)
- **Date** and **creator name**
- **Summary** — AI-generated, shown if available
- **Expandable transcript** — collapsed by default, click to expand full text
- **Audio player** — for audio uploads and meeting recordings (shown when audioUrl exists)
- **Status indicator** — spinner with status text when still processing (transcribing/extracting)
- **Source badge** — Internal or Client

No suggestion actions, no wishlist buttons. This tab is purely for reading back captured content.

## Review Suggestions Tab

Aggregates all pending AI-extracted suggestions across all notes for the selected project.

Each suggestion card shows:
- **Suggested feature title** and **description**
- **Priority** from AI extraction
- **Source note** — which note it came from (clickable, switches to View Notes tab and highlights that note)
- **Actions**:
  - **Add to Wishlist** — calls `PATCH /api/suggestions/{id}` with status "accepted", creates wishlist item
  - **Dismiss** — calls `PATCH /api/suggestions/{id}` with status "dismissed"

Top of tab shows count badge: "12 pending". When all reviewed, empty state: "All caught up — no pending suggestions."

Uses existing `MeetingSuggestion` model and `/api/suggestions/{id}` endpoint.

## Take Notes Modal

Centered modal triggered by "+ Take Notes" button. Shows three option cards side by side:

### Write
- Simple textarea with placeholder: "What happened? What did the client say?"
- Source toggle: Internal / Client
- Save button
- On save: `POST /api/notes` with `type: "text_note"`, `textContent`, `source`, `projectId`
- Modal closes, note appears in View Notes, AI pipeline runs async

### Upload
- File picker accepting audio (.mp3, .wav, .webm, .m4a) and images (.png, .jpg) for handwritten notes
- Source toggle: Internal / Client
- Upload button
- On upload: `POST /api/upload` to get URL, then `POST /api/notes` with `type: "audio_upload"` or `"handwritten"`, `audioUrl` or `imageUrl`, `source`, `projectId`
- Modal closes, processing begins async

### Meet
- Single click immediately creates a live room
- Calls `POST /api/meetings/live` with `projectId`
- Navigates to `/meet/{roomCode}` (full-page, existing component)
- Shareable link shown inside meeting UI (already in live-meeting.tsx)
- On meeting end: audio stitched, transcription pipeline runs automatically

## What Changes

| Action | File | Description |
|--------|------|-------------|
| Rewrite | `src/components/pane-notes.tsx` | Tabbed layout + Take Notes modal replacing current monolithic view |

## What Stays Unchanged

- All API endpoints (`/api/notes`, `/api/meetings/live`, `/api/upload`, `/api/suggestions/{id}`)
- Meeting page (`/meet/[roomCode]`) and `live-meeting.tsx`
- Inngest pipelines (transcription, summarization, feature extraction)
- Database schema (Meeting, MeetingSuggestion, LiveRoom, WishlistItem)
- All backend logic

## Data Flow

```
Take Notes → Write/Upload/Meet → POST /api/notes or /api/meetings/live
                                       ↓
                              Inngest pipeline runs async
                              (transcribe → summarize → extract suggestions)
                                       ↓
                              View Notes shows note with status updates
                                       ↓
                              Review Suggestions shows extracted features
                                       ↓
                              Accept → Wishlist → Push to production
```
