# Dashboard UI Redesign

## Summary

Replace slushie's current three-panel sidebar-driven layout with a project-scoped dashboard. A persistent top bar holds the brand, a universal project picker, settings, and logout. The main area renders an 8-card grid dashboard. Clicking any card does a full-page takeover to show that tool. All existing functionality and pane components are preserved — this is a UI restructure, not a feature change.

## Layout

### Top Bar (persistent across all views)

```
┌──────────────────────────────────────────────────────────────┐
│ [slushie.machine]   [ W3 > OTTERA > Test CRM  v ]   [⚙] [↗]│
│  (logo/home)          (project picker dropdown)    gear logout│
└──────────────────────────────────────────────────────────────┘
```

- **Left:** "slushie.machine" brand text with gradient. Clicking returns to dashboard from any view.
- **Center:** Project picker dropdown. Displays current selection as `Workspace > Client > Project`. Dropdown groups projects by workspace then client. Includes "+ New Project" at the bottom. Switching projects refreshes dashboard data.
- **Right:** Settings gear icon (opens settings for current workspace/client/project) + logout button.
- **Visible on every view** — dashboard, card takeovers, and inside Build.

### Dashboard (main area)

8 equal-sized cards in a responsive grid:
- Desktop: 4 columns x 2 rows
- Tablet: 2 columns x 4 rows
- Mobile: 1 column x 8 rows

Cards:

| Card | Icon | Live Preview Data |
|------|------|-------------------|
| Build | Code/terminal | Feature count + deploy status badge |
| Notes | Notepad | Note/meeting count for project |
| Feedback | Chat bubble | Feedback item count |
| Wishlist | Star/sparkle | Wishlist item count |
| Propose | Document | Scope status (draft/scoping/complete) |
| Cost Center | Dollar | Total spend for project |
| Client View | Eye | Portal status (active/inactive) |
| Team | People | Member count for project |

Each card displays: icon, title, and a small live data summary. The dashboard is informative at a glance.

### Empty State (no projects)

When the user has no projects, the dashboard area shows the existing drag-and-drop codebase upload flow. The project picker shows an empty state with "+ New Project" prompt.

### Card Takeover Views

Clicking any card replaces the dashboard with a full-page view:

```
┌──────────────────────────────────────────────────────────────┐
│ [slushie.machine]   [ W3 > OTTERA > Test CRM  v ]   [⚙] [↗]│
├──────────────────────────────────────────────────────────────┤
│ [← Back]  Notes                                              │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │                                                          │ │
│ │  Existing PaneNotes component rendered full-width        │ │
│ │                                                          │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

- Top bar persists.
- Below top bar: back arrow + card title. Back returns to dashboard. Clicking logo also returns to dashboard.
- Content area: the existing pane component rendered full-width.
- **Build is special:** renders the current three-panel layout (feature tree + context pane + live preview) instead of a single pane. All Build sub-navigation (features, meetings, project settings) stays as-is within that view.

## Data Scoping

All dashboard cards are scoped to the selected project:

- **Notes:** filtered by `projectId`
- **Feedback:** filtered by project
- **Wishlist:** filtered by project
- **Cost Center:** costs for the selected project
- **Team:** members with access to the selected project
- **Propose:** scoping data for the selected project
- **Client View:** portal status for the selected project
- **Build:** features, meetings, preview for the selected project

## Navigation State

Current state model (13-variant Selection union + sidebar collapse states + preview modes) simplifies to:

```typescript
type View =
  | "dashboard"
  | "build"
  | "notes"
  | "feedback"
  | "wishlist"
  | "propose"
  | "cost-center"
  | "client-view"
  | "team";
```

- Top level: `view` determines what renders in the main area.
- When `view === "build"`: the existing sub-navigation handles feature/meeting/project-settings selection internally via the same patterns it uses today.
- When `view === "dashboard"`: render the card grid.
- All other views: render the corresponding pane full-width with back button.

## Settings

The gear icon in the top bar opens a settings panel (dropdown or modal) with sections:
- Workspace Settings
- Client Settings
- Project Settings

Scoped to the entities implied by the current project picker selection. Workspace-level member role management lives here (admin actions).

## What Changes

| Component | Change |
|-----------|--------|
| `page.tsx` | Replace three-panel layout + Selection routing with top bar + dashboard/takeover pattern. Simplify state to `view` + `selectedProjectId`. |
| `project-sidebar.tsx` | Remove entirely. Navigation moves to dashboard cards + top bar. |
| `project-tree.tsx` | No changes. Rendered inside the Build takeover view only. |
| `context-pane.tsx` | No changes. Rendered inside the Build takeover view only. |
| All `pane-*.tsx` | No internal changes. Rendered full-width in card takeover views. May need prop adjustments for project-scoped filtering. |
| New: `dashboard.tsx` | Dashboard card grid component. |
| New: `top-bar.tsx` | Persistent top bar with project picker, settings, logout. |
| New: `project-picker.tsx` | Dropdown component grouped by workspace > client > project. |
| New: `settings-panel.tsx` | Settings gear dropdown/modal with workspace/client/project tabs. |

## What Stays Unchanged

- All existing pane component internals
- All API endpoints (no backend changes)
- The Build view's three-panel layout (feature tree + context pane + preview)
- Authentication flow
- Portal/client-facing pages (`/portal/*`)
- Login/signup pages
