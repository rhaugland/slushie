# Slushie Machine v2: Feature Tree Architecture

## Overview

Slushie Machine evolves from a linear meeting-to-deploy wizard into a **feature-tree command center** for ongoing client project delivery. The core concept: every client project is a universal base shell with toggleable, AI-generated feature modules that snap on and off instantly.

**Target user:** Consultant (Ryan) operating the tool on behalf of clients. Clients never touch slushie.machine — they see the deployed preview URL.

**Blue ocean positioning:** Not a code editor (Cursor, Claude Code), not a single-shot app generator (Bolt, Lovable, v0), not a no-code builder (Bubble). It's a **modular project orchestrator** where meetings feed a feature tree, AI builds isolated modules on demand, and toggles give instant control over what's live — without rebuilding.

---

## Architecture: Manifest-Driven Modular Apps

Every client project consists of three layers:

### 1. Universal Base Shell

A maintained Next.js scaffold copied for each new project. NOT AI-generated.

**Includes:**
- Next.js app router
- Sidebar nav that reads from `features.json` manifest
- `/features/` directory where modules mount
- Feature loader that dynamically mounts routes for enabled features
- Shared UI primitives (Button, Card, Input, Table, Modal)
- Database connection (SQLite — self-contained per project)
- Theme config loader (colors, logo from project settings)

**Does not include:**
- Auth (that's a feature module if needed)
- Business logic or pages
- Data models beyond the manifest

### 2. Feature Manifest (`features.json`)

Declares what features exist, their hierarchy, and their enabled state. The base shell reads this at runtime.

```json
{
  "features": [
    {
      "id": "contacts",
      "title": "Contact Management",
      "enabled": true,
      "route": "/contacts",
      "navIcon": "Users",
      "children": [
        {
          "id": "csv-import",
          "title": "CSV Import",
          "enabled": true,
          "route": "/contacts/import"
        },
        {
          "id": "contact-tagging",
          "title": "Contact Tagging",
          "enabled": false,
          "route": "/contacts/tagging"
        }
      ]
    }
  ]
}
```

### 3. Feature Modules

Each feature is a self-contained directory under `/features/{featureId}/` conforming to a standard contract:

- `page.tsx` — main route component
- `schema.sql` — database tables this feature needs (run on enable)
- `nav.json` — icon and label for sidebar
- Optional: sub-routes, API routes, components (all self-contained within the directory)

**Isolation rules:**
- Features never import from each other's code
- Features CAN read each other's database tables (the DB is shared)
- Features use shared UI primitives from the base shell
- The only shared things: database, nav/layout, design system

---

## UI: Two-Panel Command Center

### Left Panel — Project Tree

The feature tree is the primary interface. A collapsible, draggable tree with toggle switches:

```
Acme CRM                             [Preview]
├── Contact Management                    [ON]
│   ├── CSV Import                        [ON]
│   ├── Contact Tagging                  [OFF]
│   └── Merge Duplicates                  [ON]
├── Deal Pipeline                         [ON]
│   ├── Kanban View                       [ON]
│   └── Revenue Forecasting             [OFF]
└── Reporting                            [OFF]
    ├── Dashboard Widgets                [OFF]
    └── PDF Export                       [OFF]

Meetings
├── Mar 15 — Initial discovery call
└── Mar 28 — Pipeline review follow-up
```

Each node shows: name, toggle switch, status indicator (draft/building/live/error). Nodes are collapsible, draggable for reorder. Right-click or "+" button to add child features.

Meetings are a separate collapsible section below the tree — a reference feed, not part of the feature hierarchy.

### Right Panel — Context Pane

Shows detail for the selected tree node:

- **Project selected:** Theme config (colors, logo), deploy URL, project settings
- **Major feature selected:** Title, description (editable), status, "Build"/"Rebuild" button, build logs, list of minor features with toggles
- **Minor feature selected:** Title, description (editable), toggle, status, build logs
- **Meeting selected:** Audio player, transcript, AI-extracted feature suggestions with "Add to tree" buttons

---

## Toggle System

### Behavior

- Toggle ON/OFF updates `features.json` on disk. No AI call. No rebuild. Instant.
- Dev server hot reload picks up the manifest change.
- Nav item appears/disappears. Route mounts/unmounts.

### Cascade Rules

- Toggling a major feature OFF hides the entire branch (all children hidden)
- Children's individual `enabled` states are preserved in the manifest
- Toggling the major feature back ON restores children to their previous states
- A minor feature cannot be ON if its parent is OFF

### Data Preservation

- Toggling a feature OFF does not drop its database tables or delete its files
- The code stays in `/features/{featureId}/`, just unmounted
- Data stays in the database, just not accessible via UI
- Toggling back ON restores everything immediately

---

## AI Generation Pipeline

One AI call per feature. No separate architect step — the module contract IS the architecture.

### What the AI receives:

1. Feature title and description
2. Module contract spec (directory structure, required files, available shared components)
3. Project's current database schema (all tables, so it can reference or create)
4. List of other enabled features (names + table schemas only, no code)
5. Project's theme config

### What the AI produces:

```json
{
  "files": [
    { "path": "page.tsx", "content": "..." },
    { "path": "schema.sql", "content": "..." },
    { "path": "components/ContactList.tsx", "content": "..." }
  ]
}
```

### Pipeline steps (Inngest):

1. **Prepare context** — gather DB schema, sibling feature list, theme config
2. **Generate module** — Claude produces the file array
3. **Write files** — drop into `/features/{featureId}/`
4. **Run migrations** — execute `schema.sql` if present
5. **Update manifest** — add/update the feature in `features.json`
6. **Hot reload** — running preview picks up the new module

### Rebuild flow:

Same pipeline, but step 3 overwrites the existing module directory. For schema migrations on rebuild: the pipeline runs `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ADD COLUMN IF NOT EXISTS` — additive only. Tables and columns are never dropped during rebuild to preserve data. If a rebuild fundamentally changes a feature's data model, the old tables remain and new ones are created alongside.

---

## Meeting Integration

Meetings are an input channel, not the workflow driver.

### Upload flow:

1. Upload audio in the Meetings section
2. Transcription (Deepgram) and feature extraction (Claude) run as today
3. AI-extracted suggestions land in the meeting's detail pane as cards
4. Suggestions are NOT automatically added to the tree

### Suggestion cards show:

- Suggested title and description
- AI's assessment: major or minor feature
- AI's suggested parent (if minor): "This sounds like it belongs under Contact Management"
- "Add to tree" button with placement picker
- "Dismiss" button

### Multi-meeting intelligence:

When processing a second meeting, the AI sees the existing feature tree. If the client says "contacts needs tagging," the AI suggests "Contact Tagging" as a minor feature under existing Contacts — not a duplicate major feature.

### Audit trail:

Meeting history stays attached to the project. Each meeting shows which suggestions were accepted, dismissed, or still pending. Traceable back to the conversation where the client asked for it.

---

## Deploy Model

One project = one persistent preview server. One URL that evolves over time.

### Lifecycle:

1. **Create project** — base shell copied to `/previews/{project-slug}/`, dependencies install, dev server starts on dynamic port. URL assigned. This happens once.
2. **Add feature** — AI generates module, files written into running project's `/features/` directory, manifest updated. Hot reload. Client refreshes, feature is there.
3. **Toggle feature** — manifest updated on disk. Hot reload. Instant.
4. **Rebuild feature** — module directory overwritten. Hot reload. Same URL.

### No redeployment needed for:

- Adding a new feature (hot reload)
- Toggling features on/off (hot reload)
- Rebuilding a feature (hot reload)

### The client experience:

One URL, shared once. The project evolves behind that URL. Client refreshes to see changes. No new links, no redeployment.

---

## Data Model

### Project

| Field | Type | Description |
|-------|------|-------------|
| id | string | Primary key |
| name | string | Project name (e.g., "Acme CRM") |
| clientName | string | Client's name |
| clientFirm | string | w3 or isotropic |
| themeConfig | JSON | Colors, logo, fonts |
| baseVersion | string | Shell version |
| manifestJson | JSON | Live feature manifest (mirrors features.json on disk) |
| deployUrl | string? | Preview server URL |
| deployStatus | string | stopped / running / error |
| createdAt | datetime | |

### Feature

| Field | Type | Description |
|-------|------|-------------|
| id | string | Primary key |
| projectId | string | FK to Project |
| parentId | string? | FK to Feature (null = major, set = minor) |
| title | string | Feature name |
| description | string | What this feature does |
| enabled | boolean | Toggle state |
| sortOrder | int | Position in tree |
| status | string | draft / building / live / error |
| moduleHash | string? | Fingerprint of generated code |
| createdAt | datetime | |

### FeatureBuild

| Field | Type | Description |
|-------|------|-------------|
| id | string | Primary key |
| featureId | string | FK to Feature |
| generatedCode | JSON | File array |
| buildLogs | JSON | Step/total/message progress |
| status | string | queued / generating / complete / failed |
| createdAt | datetime | Build history |

### Meeting

| Field | Type | Description |
|-------|------|-------------|
| id | string | Primary key |
| projectId | string | FK to Project |
| audioUrl | string | Path to audio file |
| transcript | string? | Full transcript |
| status | string | uploading / transcribing / extracting / ready / failed |
| createdAt | datetime | |

### MeetingSuggestion

| Field | Type | Description |
|-------|------|-------------|
| id | string | Primary key |
| meetingId | string | FK to Meeting |
| suggestedTitle | string | AI-proposed feature name |
| suggestedDescription | string | AI-proposed description |
| suggestedPriority | string? | high / medium / low |
| suggestedParentTitle | string? | AI's guess at parent feature |
| status | string | pending / accepted / dismissed |
| featureId | string? | FK to Feature (set when accepted) |

---

## What's NOT in Scope

- Client-facing dashboard (future — start as operator-only tool)
- Authentication/user accounts (single operator for now)
- Real domain deployment (ngrok/localhost previews for now)
- Feature versioning/rollback (future consideration)
- Cross-feature communication beyond shared database
- Template marketplace or pre-built feature library
