# Sales Canvas — Claude Context

This document captures the full project context, architectural decisions, and
working conventions established over the development conversation. New Claude
sessions should read this before making changes.

---

## Table of contents

1. [Project identity](#project-identity)
2. [Current stack](#current-stack)
3. [Deployment topology](#deployment-topology)
4. [Universal Sales Object architecture](#universal-sales-object-architecture)
5. [Semantic zoom + node registry](#semantic-zoom--node-registry)
6. [Canvas Zones (containers)](#canvas-zones-containers)
7. [Auth model](#auth-model)
8. [Sources framework (Gmail today)](#sources-framework-gmail-today)
9. [Chrome extension](#chrome-extension)
10. [Automation framework + Stripe](#automation-framework--stripe)
11. [AI features](#ai-features)
12. [Database schema + migration timeline](#database-schema--migration-timeline)
13. [Environment variables](#environment-variables)
14. [Development workflow](#development-workflow)
15. [Conventions the user has established](#conventions-the-user-has-established)
16. [Feature roadmap](#feature-roadmap)
17. [Known issues + follow-ups](#known-issues--follow-ups)
18. [Related projects (do not modify)](#related-projects-do-not-modify)

---

## Project identity

**Sales Canvas** is an AI-powered visual operating system for salespeople —
a spatial canvas that replaces browser tabs. Everything on the canvas is a
"Sales Object" — notes, emails, tasks, follow-ups, meetings, automations,
future voice notes, Slack messages, Stripe alerts, CRM updates, browser
captures, AI agent outputs.

Product mantras:
- **"There are no pages. There are only nodes."**
- Semantic zoom: nodes reveal more detail as the user zooms in
- Everything is a canvas node — do not add tabs, routes, or separate dashboards
- Universal Sales Object model — new object types plug in as new `node_type` +
  new renderer, no schema fork

Explicitly out of scope:
- CRM replacement
- LinkedIn scraping/automation
- Email sending (drafts only)
- Browser tab scraping
- Wake-word / always-listening voice
- Electron
- Autonomous outbound of any kind

## Current stack

- **Backend**: Express + TypeScript, `pg` (node-postgres), Postgres
- **Frontend**: React + Vite + TypeScript + Tailwind, `@xyflow/react` (React
  Flow v12) for the canvas
- **Auth**: bcrypt password + Google OAuth (identity); Google OAuth again with
  incremental Gmail scope for Sources
- **DB**: Supabase Postgres in production; local Postgres or Supabase
  transaction-mode pooler in dev
- **AI**: OpenAI Chat Completions API (`gpt-4o-mini` default)
- **Extension**: Manifest V3 Chrome extension for global-hotkey capture
- **Icons**: `lucide-react`
- **Router**: `react-router-dom` — used only for the auth gate (/login, /signup,
  /settings). The canvas itself is a single page; navigation between nodes is
  camera animation, not routing.

## Deployment topology

| Layer | Host | URL |
|---|---|---|
| Frontend | Vercel | `https://sales-op-frontend.vercel.app` |
| Backend | Render | `https://salesop-9ajb.onrender.com` |
| Database | Supabase | (project-specific) |

Local dev: backend on `:3001`, frontend on `:5173`. Vite proxies `/api/*` from
5173 → 3001.

Real users are actively testing. **Every change must be backwards-compatible.**
Migrations must be additive/idempotent. Auth and the Chrome extension must
keep working across any change.

## Universal Sales Object architecture

**Everything is a row in `canvas_nodes`.** Notes, emails, prospects, accounts,
follow-ups, automations, and the Zones themselves — all `canvas_nodes` rows
distinguished by `node_type`.

Common fields (see [database/schema.sql](database/schema.sql)):
- `id`, `workspace_id`, `canvas_id`
- `node_type` — the discriminator (CHECK-constrained list; see migrations for
  the full set)
- `title`, `body`, `status`
- `position_x`, `position_y`, `width`, `height`
- `tags_json`, `metadata_json`
- `source_type`, `source_id` — provenance for ingested objects (Gmail message
  id, capture URL, etc.)
- `created_at`, `updated_at`

### Ingestion conventions for provider-produced objects

- `source_type` = provider key (`'gmail'`, `'capture'`, future `'slack'`,
  `'outlook'`, …)
- `source_id` = provider's stable external ID
- `metadata_json` well-known keys:
  - `external_id`, `external_url`, `received_at`, `source_provider`
  - `thread_id` — reserved slot for future thread grouping across providers
    (indexed via a partial JSONB expression index; see migration 005)
  - `ai_summary`, `ai_summary_generated_at`, `ai_summary_mocked` — lazy AI
    summary cache
  - Provider-specific fields go inside `metadata_json` freely

### Dedup

Unique index `idx_canvas_nodes_source_dedup` on
`(workspace_id, source_type, source_id)` where both non-null. Re-sync from any
provider is idempotent by construction.

### Rule of thumb

When adding any new "kind of thing" (voice note, meeting recording, Slack
message, HubSpot task):
1. Add a `node_type` to the CHECK
2. Add a renderer to the frontend registry
3. If ingested from a remote source, add a `SourceProvider` implementation
4. **Do not** add a new table unless the new type has structural fields that
   truly don't fit in `metadata_json`

## Semantic zoom + node registry

React Flow's viewport zoom drives a categorical level via
[frontend/src/canvas/zoom.ts](frontend/src/canvas/zoom.ts):

| Zoom | Level | UI |
|---|---|---|
| `<0.45` | `compact` | tile, icon + short label + status dot |
| `0.45–0.85` | `preview` | title + status + summary + maybe first children |
| `≥0.85` (Enter key) | `detail` | full-page dashboard overlay ("focused" or "immersive" mode) |

### ZoomContext

[frontend/src/canvas/ZoomContext.tsx](frontend/src/canvas/ZoomContext.tsx) —
`ZoomTracker` reads `useViewport().zoom` and publishes the level via context
**only when the level changes**, so nodes don't re-render on every pan-zoom
frame. It must wrap `<ReactFlow>` (not sit inside it) so context reaches nodes.

### Renderer registry

[frontend/src/canvas/renderers/registry.ts](frontend/src/canvas/renderers/registry.ts)
maps `NoteType` → `NodeRendererSet` `{ compact, preview, detail, defaultWidth,
defaultHeight }`. Missing types fall through to `Generic`. Detail renderers
receive `mode: 'focused' | 'immersive'` plus `onPatch`, `onExit`, `onOpenNode`
callbacks.

Renderers implemented with rich detail views:
- `DailyBriefing` (home)
- `CommandCenter`
- `Prospect`
- `Email`
- `Zone` (dispatches on `node_type` internally for the 5 zone types)
- `Generic` (fallback for everything else)

### Camera

[frontend/src/canvas/CameraController.ts](frontend/src/canvas/CameraController.ts)
returns a `useMemo`-stable `{ flyTo }` object. `flyTo(nodeId, { zoomLevel })`
animates via `setCenter` / `fitView` with duration; never teleports.

### Home + navigation

- `H` flies to Home (Daily Briefing)
- `Cmd/Ctrl+K` opens the command palette; palette items include "Go to node"
  entries that call `flyTo`
- `Enter` on a selected node — or a double-click on the node
  (`onNodeDoubleClick`; `zoomOnDoubleClick` is disabled so it doesn't fight the
  open animation) — opens the Detail overlay at expanded/immersive zoom
- `Esc` closes overlays and deselects
- `N` new note, `B` new box, `Shift+A → C` runs Stripe check
- `/` opens Search & Filters (deliberately not `Cmd/Ctrl+F`)

### On first canvas load

`fitView` — NOT `flyTo(home)`. Frames every node so the user sees the spatial
layout. Filter out far-off nodes (position > ±2200) so stale captures don't
zoom out the world.

## Canvas Zones (containers)

Migration 006 introduced 5 first-class zone node types:
`home_zone`, `email_zone`, `notes_zone`, `tasks_zone`, `automation_zone`.

### Grid layout

Fixed in [backend/src/services/layoutStrategy.ts](backend/src/services/layoutStrategy.ts):

```
     x=0            x=2200         x=4400
y=0  [Home]         [Email]        [Automation]
y=1400 [Notes]      [Tasks]        (empty for future)
```

Each zone: 1800 × 1000.

### Which node_types live in which zone

- `home_zone`: `daily_briefing`, `command_center`, `ai_assistant`
- `email_zone`: `email`
- `notes_zone`: `prospect`, `account`, `general_note`, `call_summary`,
  `objection`, `email_draft`, `linkedin_draft`, `capture`, `screenshot`,
  `voice_note`, `box`
- `tasks_zone`: `task`, `followup`, `meeting`
- `automation_zone`: `automation_result`, `automation_hub`, `stripe`

### Placement inside zones

`positionInsideZone(nodeType, offset)` places a child at column/row inside its
home zone (3 columns × N rows, 40px padding, 110px header gutter, 300×200
child slots).

For provider ingest (`objectIngest.ts`), `getLayoutStrategy().positionForIngestedObject({ providerKey, offset, nodeType })`
routes each email into the Email Zone, each captured note into Notes Zone,
etc.

### Zone rendering

Zones render at `zIndex: -10` and `draggable: false` so they sit under their
children and never move. Child nodes render on top.

`metadata_json` on zones:
- `zone_key`: `home`/`email`/`notes`/`tasks`/`automation`
- `child_types`: array of node_types this zone hosts

Zone detail overlay aggregates children by filtering `allNotes` by
`child_types` (via the `RendererContext` passed to every renderer). Filter
chips at preview/detail are UI-only (read `metadata_json` and `status`
client-side).

## Auth model

Two auth surfaces:

### 1. User login (existing users)

- **Email + password**: bcrypt hashed (`backend/src/services/auth.ts`,
  `userService.ts`)
- **Google OAuth (login)**: `openid email profile` only. Endpoints at
  `/api/auth/google/{start,callback}`. State is a 10-min JWT.
- Session cookie: `HttpOnly; SameSite=None; Secure`. `SameSite=None` chosen so
  the Chrome extension can send it cross-site. Chrome accepts `Secure` on
  `http://localhost` for dev.

### 2. API tokens (extension / service)

- `POST /api/tokens` creates `sct_<hex>` tokens
- Stored SHA-256 hashed in `api_tokens` table with 12-char prefix
- Plaintext returned once at creation, never again
- Extension can use `Authorization: Bearer <token>` as a fallback if cookie
  auth doesn't work
- The extension defaults to cookie auth (user must be signed in on the canvas
  in a browser tab); tokens are only needed for headless/service-account use

### Middleware order (`backend/src/app.ts`)

1. Helmet
2. Custom CORS (allows `DASHBOARD_ORIGIN` + `chrome-extension://*` +
   `moz-extension://*`)
3. `express.json`, `cookieParser`
4. `attachAuth` — reads session cookie OR bearer token, populates
   `req.userId`, `req.workspaceId`, `req.role`, `req.authVia`
5. Public routes: `/health`, `/api/auth/*`, `/api/capture`, `/api/gmail/oauth/*`
6. `requireAuth` gate
7. Everything else

## Sources framework (Gmail today)

### Universal `SourceProvider` contract

[backend/src/sources/types.ts](backend/src/sources/types.ts) defines
`SourceProvider`:

```ts
{
  key: string                    // 'gmail', later 'slack', 'outlook', 'hubspot'
  displayName: string
  producesNodeType: string       // 'email' — visual/color is decided by the
                                 // RENDERER, not the provider
  status(ctx): Promise<ConnectionStatus>
  connectStartUrl(ctx, redirect): Promise<string | null>
  handleCallback(ctx, { code, state }): Promise<void>
  disconnect(ctx): Promise<void>
  sync(ctx, opts): Promise<{ objects: SalesObject[], cursor_watermark }>
}
```

### Provider registry

[backend/src/sources/registry.ts](backend/src/sources/registry.ts) — adding a
new source is: one folder under `backend/src/sources/<key>/` + one line here.

### Object ingest orchestrator

[backend/src/services/objectIngest.ts](backend/src/services/objectIngest.ts)
is provider-agnostic. It:
1. Opens an `object_syncs` row (`status='running'`)
2. Calls `provider.sync()`
3. Upserts each `SalesObject` into `canvas_nodes` via `(workspace_id,
   source_type='<key>', source_id=<external_id>)` — dedup free
4. Finishes the sync row + writes audit log

### Gmail provider

[backend/src/sources/gmail/](backend/src/sources/gmail/) has:
- `index.ts` — selector between real and mock based on `GMAIL_PROVIDER` env
- `real.ts` — real Gmail API (readonly). Fetches `is:important OR is:unread`,
  ~50 messages. Uses `messages.list` + `messages.get` metadata format. Runs
  token refresh transparently.
- `mock.ts` — returns 3 realistic synthetic emails; enables local dev and
  demos without Google Cloud

### Universal Sources UI

[frontend/src/components/ConnectSourceButton.tsx](frontend/src/components/ConnectSourceButton.tsx)
exports both `ConnectSourceButton` (for one source) and `SourcesToolbar` (iterates
every registered source and renders one button per). TopBar renders the
Toolbar — when a second provider registers on the backend, the frontend picks
it up with no code change.

Color for each button derives from the produced `node_type` (via `nodeStyles`
palette), not from the provider. Multiple providers producing `email` all get
yellow.

### Layout strategy

Every object placed on the canvas goes through
[layoutStrategy.ts](backend/src/services/layoutStrategy.ts). See
[Canvas Zones](#canvas-zones-containers) above.

## Chrome extension

`extension/` — Manifest V3.

### Capture hotkey

- **`Alt+Shift+S`** (rebindable at `chrome://extensions/shortcuts`)
- `Ctrl+Alt+S` was blocked by Chrome's manifest validator (Chrome treats
  `Ctrl+Alt` as `AltGr` for European keyboards); documented in
  `extension/README.md`

### What it captures

- If text is selected on the active tab → captures the selection
- Else if on `mail.google.com` → extracts subject + visible message bodies from
  the open conversation (uses `h2.hP` for subject, `.a3s.aiL` for bodies —
  stable Gmail selectors used by many extensions)
- Else → notification "select something first"

### Auth

- Uses session cookie via `credentials: 'include'` (works because backend
  cookie is `SameSite=None; Secure`)
- Falls back to API token (`Authorization: Bearer sct_…`) if configured under
  Advanced in the popup
- Popup shows "Signed in as email" pill (green) or "Sign in to canvas"
  fallback

### Backend endpoint

`POST /api/capture` — auth via cookie or bearer. Also has a dev-only
`DEV_CAPTURE_NO_AUTH` fallback that skips auth in local dev with a configured
fallback user.

### Note about Gmail

The extension still scrapes Gmail DOM for captures. With real Gmail sync now
available, this is redundant for Gmail specifically. Not yet refactored —
flagged as follow-up.

## Automation framework + Stripe

`backend/src/automations/`:
- `types.ts` — `SourceProvider`-style contract for automations
- `registry.ts` — routine registry
- `stripeConnectionCheck.ts` — the `stripe.connection.check` routine

Behavior:
- Read-only against Stripe test mode
- **Refuses `sk_live_*` keys at runtime** — hard block
- Creates an `automation_result` canvas node (yellow) with
  `resolved`/`needs_review`/`failed` status
- Writes an `automation_runs` row + audit log entry

Trigger: `Shift+A → C` hotkey or button in TopBar → `POST /api/automations/run`
with `routine_key='stripe.connection.check'`. Result node lands in Automation
Zone.

## AI features

`backend/src/services/aiSummarize.ts`:
- `summarizeText({ workspaceId, text, hintType? })` — full note-shape summary
  (title + body + type + tags + next_step). Used by `/api/ai/summarize`,
  `/api/capture`, and the Ctrl+Q modal.
- `summarizeForContext({ workspaceId, text, purpose })` — short one-sentence
  summary (email/meeting/note). Fallback returns first two sentences when
  OpenAI is not configured.

### Lazy email summary

`POST /api/notes/:id/ai-summarize` — reads
`canvas_nodes.metadata_json.ai_summary`; if absent, generates via OpenAI
(purpose derived from `node_type`) and patches the metadata. Cached forever
afterward.

Email Detail overlay auto-fetches on mount via `useLazyAiSummary(note)`.

**Sync never calls OpenAI.** Summaries are lazy per email on first open.

### Draft replies

`POST /api/ai/draft-reply` with `{ channel: 'email'|'linkedin', source_note_id,
intent? }`. Never auto-sends. Drafts appear as `email_draft` / `linkedin_draft`
nodes.

### AI outputs cache

`ai_outputs` table stores every AI call keyed on `(workspace_id, task,
input_hash)`. Deterministic re-fetches are free.

## Database schema + migration timeline

Base: [database/schema.sql](database/schema.sql). Then migrations in order.

| # | File | Purpose |
|---|---|---|
| 002 | `002_auth.sql` | password_hash, api_tokens |
| 003 | `003_google_oauth.sql` | google_sub, avatar_url |
| 004 | `004_phase1_nodes.sql` | Node type CHECK widened for phase-1 taxonomy |
| 005 | `005_gmail_and_sources.sql` | `user_oauth_tokens`, `object_syncs`, `'email'` type, source dedup index, `thread_id` JSONB index |
| 006 | `006_canvas_zones.sql` | 5 zone types added + seeded per workspace |
| 007 | `007_soft_delete.sql` | `deleted_at` column + partial indexes (Trash Bin) |

Every migration is idempotent and additive. Never edit a shipped migration.

Running migrations: `npm run db:migrate` (in the project root — a workspace
proxy to backend's `db:migrate` npm script).

**⚠ Supabase gotcha:** the session-mode pooler caps at 15 clients. Use the
**transaction-mode pooler** URL (port `6543`, not `5432`) for `DATABASE_URL`
on both Render and dev to avoid `EMAXCONNSESSION` errors. All code (no
prepared statements, transactions within one `pool.connect()` scope) is
compatible with transaction mode.

## Environment variables

Full list in [backend/.env.example](backend/.env.example). Key ones:

### Required

- `DATABASE_URL` — **use Supabase transaction-mode pooler URL (port 6543)**
- `SESSION_SECRET` — JWT signing for session cookie
- `TOKEN_ENCRYPTION_KEY` — AES-256-GCM key for OAuth tokens at rest.
  **Required in production** (boot refuses without it). Dev falls back to a
  key derived from `SESSION_SECRET` with a warning.
- `DASHBOARD_ORIGIN` — CORS allowed origin. Comma-separated list supported.

### Google OAuth (login)

- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI` — must exactly match one of the URIs registered
  on the OAuth 2.0 Client in GCP Console

### Gmail source

- `GMAIL_PROVIDER` = `real` | `mock` (default `mock`)
- `GMAIL_OAUTH_REDIRECT_URI` — for the incremental Gmail scope flow. Distinct
  from the login redirect. In prod: `https://salesop-9ajb.onrender.com/api/gmail/oauth/callback`
- `GMAIL_POST_CONNECT_ORIGIN` — where the callback bounces back to (Vercel
  frontend in prod)
- `GMAIL_DEFAULT_LIMIT`, `GMAIL_SYNC_MAX_LIMIT` — message limits per sync

### AI

- `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`)

### Dev-only

- `DEV_CAPTURE_NO_AUTH=true` + `DEV_CAPTURE_USER_EMAIL=…` — extension capture
  works without auth in local dev only. Refused in production.

### Vercel frontend

- `VITE_API_BASE` — backend URL. Vite proxies `/api/*` locally, uses this in
  production build.

## Development workflow

### Running locally

```powershell
# One-time
npm install
copy backend\.env.example backend\.env    # then edit .env
npm run db:migrate

# Two terminals
npm run dev:backend        # port 3001 — start FIRST
npm run dev:frontend       # port 5173 — start after backend is listening
```

Start order matters. The frontend proxies to the backend; starting frontend
first triggers `ECONNREFUSED` spam until backend is up.

### Chrome extension for local dev

1. `chrome://extensions` → Developer mode ON → **Load unpacked** → pick
   `extension/`
2. Click the extension icon → paste your API token (from `/settings`) OR sign
   in on the canvas tab so cookie auth works
3. `Alt+Shift+S` anywhere to capture

### Builds

```powershell
cd backend && npm run build       # tsc → dist/
cd frontend && npm run build      # tsc + vite build → dist/
```

Both are used for typecheck verification after edits.

## Conventions the user has established

These behaviors were made explicit through the conversation. Honor them
without asking.

### Planning workflow

For **features**, the sequence is:
1. Inspect the codebase and confirm current state
2. **Present a plan** — do NOT write code yet
3. Wait for user approval (they may amend)
4. Implement the approved plan in one pass
5. Run typecheck + build
6. Report: files changed, migrations, endpoints, env vars, testing checklist,
   risks, architectural notes, "is the architecture scaling well?"
7. **Stop and wait** for review before moving on

For amendments (mid-feature), implement directly and report.

### Universal patterns to prefer

- **Extend the existing architecture** instead of building parallel systems
- New object types = new `node_type` + new renderer, not new tables
- New ingest sources = new `SourceProvider` implementation, not new endpoints
- Layout policy lives in `layoutStrategy.ts` — providers don't know positions
- Visual style lives on the renderer — providers don't know colors

### Never do

- Add tabs or routes for object types (canvas only)
- Scrape browser DOM (Chrome extension Gmail extractor is grandfathered but
  flagged for removal)
- Auto-send email or LinkedIn messages
- Modify Stripe data (read-only)
- Log OAuth tokens, message bodies, or secrets
- Delete migrations after they've shipped
- Edit files in `C:\york\dRep` or `C:\york\demo` (see
  [Related projects](#related-projects-do-not-modify))

### Amendment style established

When the user approves with amendments, they list them numerically. Apply
each concretely, then report which change addressed which amendment.

## Feature roadmap

Ordered by the user's stated priorities.

### Shipped

- **F1: Gmail Important Emails** — source framework, real+mock Gmail provider,
  lazy AI summaries, universal SourceProvider contract, `object_syncs`,
  `user_oauth_tokens` (encrypted), Email renderer, dedup index, thread index
- **F1 amendments**:
  1. Color out of the provider (lives on renderer, keyed on `producesNodeType`)
  2. Layout strategy module (no hardcoded columns; zone-aware after F1.5)
  3. Lazy AI email summaries (never during sync; cached in `metadata_json`)
  4. Sources-oriented UI (`SourcesToolbar` iterates dynamically)
  5. Thread-grouping JSONB index (canonical `metadata_json->>'thread_id'`)
- **F1.5: Canvas Zones** — 5 zone types as first-class nodes, zone-aware
  layout, Zone renderer, migration 006 seeds zones for existing workspaces,
  starter seed places items inside zones
- **F2: Canvas Search & Filters** — floating `SearchPanel` overlay (opened with
  `/`, the TopBar Search button, or the `Search notes` palette command; NOT
  `Cmd/Ctrl+F`, to leave browser find intact). Client-side search over the
  already-loaded notes across title/body/tags/`ai_summary`/`subject`. Filters:
  All/Notes/Emails/Resolved/Trash with live counts; blue=notes, yellow=emails.
  Selecting a result flies the camera to the node (emails fly to the Email
  zone). Split into `SearchPanelContent` (embeddable) + `SearchPanel` (modal)
  so it can later be reused inside a Search Workspace node.
- **F3: Persistent Trash Bin** — soft delete via `deleted_at` (migration 007).
  `GET /api/notes` excludes trashed; `GET /api/notes/trash` lists them; `DELETE
  /api/notes/:id` is now soft (audit `note.trash`); `POST /api/notes/:id/restore`
  (`note.restore`) and `DELETE /api/notes/:id/permanent` (`note.purge`, requires
  the node already be trashed + client-side confirm). Bottom-left `TrashPanel`
  with restore / delete-forever; TopBar trash button with count; store exposes
  `trashedNotes`. Stats exclude trashed.

### Next up (approved to plan first)

- **F4 (TBD)** — next feature not yet chosen. Candidates: edge delete via UI,
  tag filtering, screenshot OCR, HubSpot read-only connector.

### Deferred (do NOT implement)

- LinkedIn integration
- Email/LinkedIn sending
- Browser DOM scraping
- Autonomous outbound
- Permanent delete without confirmation
- Electron
- Multi-tenant enterprise features

## Known issues + follow-ups

### Operational

- **Supabase pool exhaustion** — solved by using transaction-mode pooler URL
  (see [DB section](#database-schema--migration-timeline)). If you see
  `EMAXCONNSESSION`, that's the cause.
- **Google consent screen: Testing mode** — testers must be added to the Test
  users list in GCP OAuth consent screen
- **Vercel + Render cross-domain OAuth** — never rely on session cookie
  reaching the Render callback endpoint. Identity lives in the signed state
  JWT. Callback bounces back to `GMAIL_POST_CONNECT_ORIGIN` (Vercel).

### Small hygiene items flagged in prior reports

- Connect/disconnect audit entries are missing (only sync writes audit today)
- `/health/integrations` doesn't yet report Gmail configuration state
- Chrome extension's Gmail DOM extractor is redundant now that real Gmail
  sync exists
- `DB_POOL_MAX` env var would let Render vs. local dev tune pool size
  independently (currently hardcoded to 10 in `db.ts`)
- Vite chunk-size warning at build (~645 KB JS gzip 200 KB); non-blocking

### Legacy captures from before F1.5

Users who tested before Canvas Zones may have nodes at positions like
`(3100, 1900)` from an older cascading capture layout. These sit outside
zones and are backwards-compatible cosmetic outliers. They can be moved into
zones manually with SQL if desired.

## Related projects (do not modify)

Two sibling directories exist. They are separate products.

- `C:\york\dRep` — **RelayOps**, a trucking operations intelligence platform.
  Its own PostgreSQL schema, Express backend, React dashboard, Chrome
  extension, and marketing analysis. **Do not modify** unless the user is
  specifically working on RelayOps. Full architecture documentation there
  includes a `DEPLOYMENT_CHECKLIST.md`, `PRODUCTION_ENV_VARS.md`,
  `STAGING_SMOKE_TESTS.md`, `PILOT_ACCEPTANCE_TESTS.md`, and
  `ROLLBACK_PLAN.md`.
- `C:\york\demo` — **RelayOps marketing website** (React + Vite +
  React Router). Separate concern. **Do not modify** unless the user is
  working on the marketing site.

**Anything under `C:\york\sales-canvas` is the current project.**

---

## Quick reference — file map

```
sales-canvas/
├── backend/
│   ├── src/
│   │   ├── app.ts                       # Express entry
│   │   ├── config/env.ts                # All env vars
│   │   ├── middleware/requireAuth.ts    # attachAuth + requireAuth
│   │   ├── routes/
│   │   │   ├── auth.ts                  # Email/password + Google login
│   │   │   ├── apiTokens.ts             # sct_ tokens
│   │   │   ├── notes.ts                 # canvas_nodes CRUD, edges, ai-summarize
│   │   │   ├── capture.ts               # /api/capture (from extension)
│   │   │   ├── ai.ts                    # /api/ai/summarize, /api/ai/draft-reply
│   │   │   ├── automations.ts           # Stripe routine trigger
│   │   │   ├── stats.ts, audit.ts       # small helpers
│   │   │   ├── gmail.ts                 # OAuth prepare + callback
│   │   │   └── sources.ts               # Universal /api/sources
│   │   ├── sources/
│   │   │   ├── types.ts                 # SourceProvider contract
│   │   │   ├── registry.ts              # provider registry
│   │   │   └── gmail/
│   │   │       ├── index.ts             # real vs mock selector
│   │   │       ├── real.ts              # Gmail API
│   │   │       └── mock.ts              # 3 synthetic emails
│   │   ├── services/
│   │   │   ├── db.ts                    # pg pool + query/queryOne/withTransaction
│   │   │   ├── auth.ts                  # bcrypt + JWT + cookie helpers
│   │   │   ├── auditLog.ts              # writeAudit
│   │   │   ├── tokenEncryption.ts       # AES-256-GCM
│   │   │   ├── oauthTokenService.ts     # user_oauth_tokens DB layer
│   │   │   ├── aiSummarize.ts           # summarizeText + summarizeForContext
│   │   │   ├── objectIngest.ts          # provider-agnostic ingest
│   │   │   ├── layoutStrategy.ts        # zone grid + positioning + seedZonesSQL
│   │   │   ├── canvasService.ts, userService.ts, ...
│   │   │   └── starterSeed.ts           # signup seeds zones + starter items
│   │   └── automations/
│   │       ├── types.ts, registry.ts
│   │       └── stripeConnectionCheck.ts
│   └── scripts/apply-migrations.ts
├── frontend/
│   ├── src/
│   │   ├── App.tsx                      # Router + guards + providers
│   │   ├── state/
│   │   │   ├── authContext.tsx          # useAuth
│   │   │   └── sourcesContext.tsx       # useSources
│   │   ├── pages/
│   │   │   ├── Canvas.tsx               # THE canvas — everything happens here
│   │   │   ├── Login.tsx, Signup.tsx
│   │   │   └── Settings.tsx             # API tokens (only non-canvas UI)
│   │   ├── canvas/
│   │   │   ├── NoteNode.tsx             # React Flow node — dispatches to renderer
│   │   │   ├── ZoomContext.tsx, zoom.ts # semantic zoom
│   │   │   ├── CameraController.ts, CanvasModeContext.tsx
│   │   │   ├── nodeStyles.ts            # labels, accents, backgrounds per type
│   │   │   └── renderers/
│   │   │       ├── registry.ts
│   │   │       ├── types.ts, shared.tsx
│   │   │       ├── Generic/, DailyBriefing/, CommandCenter/, Prospect/
│   │   │       ├── Email/, Zone/
│   │   ├── components/
│   │   │   ├── TopBar.tsx               # Stats + SourcesToolbar + user menu
│   │   │   ├── ConnectSourceButton.tsx  # + SourcesToolbar
│   │   │   ├── Inspector.tsx, RunHistory.tsx, CommandPalette.tsx, ...
│   │   └── api/client.ts                # Fetch helpers
│   └── vite.config.ts                   # Proxies /api/*
├── database/
│   ├── schema.sql                       # baseline
│   ├── seed.sql                         # dev-only demo data
│   └── migrations/
│       ├── 002_auth.sql
│       ├── 003_google_oauth.sql
│       ├── 004_phase1_nodes.sql
│       ├── 005_gmail_and_sources.sql
│       └── 006_canvas_zones.sql
├── extension/
│   ├── manifest.json                    # MV3
│   ├── background.js                    # Service worker + capture
│   ├── popup.html, popup.js             # Config UI
│   └── README.md
└── CLAUDE.md                            # this file
```

---

*Last updated after Canvas Zones (F1.5) shipped. F2 (Search & Filters) is
next up — approved to plan first, wait for user approval, then implement.*
