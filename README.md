# Sales Canvas

A visual AI workspace for sales-manager workflows. Notes, prospects, accounts,
followups, objections, and automation results live on one canvas. Hotkeys
trigger captures and routines. AI summarizes pasted text into typed notes.
Outbound messages are draft-only.

This is an MVP. Single workspace, single user, no auth UI. Built to be demoed,
not to scale.

---

## What's inside

```
sales-canvas/
├── backend/        Express + TypeScript + Postgres
├── frontend/       React + Vite + React Flow + Tailwind
├── database/       schema.sql + seed.sql
├── extension/      Chrome MV3 extension — Ctrl+Alt+S global capture
```

### Tech stack
- React 18 + Vite + TypeScript
- React Flow (@xyflow/react) for the canvas
- Tailwind for styles
- cmdk for the command palette
- react-hotkeys-hook for global shortcuts
- Express + pg for the backend
- OpenAI (chat.completions, JSON mode) for summarize + draft-reply
- Stripe Node SDK (test mode only) for the connection-check routine

---

## Quick start

### 1. Postgres

You need a running Postgres 14+ and a database. Easiest local route:

```
docker run --name salescanvas-pg -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 -d postgres:16
docker exec -it salescanvas-pg psql -U postgres -c "CREATE DATABASE sales_canvas;"
```

### 2. Backend env

```
cd backend
cp .env.example .env
# edit .env and set OPENAI_API_KEY and STRIPE_TEST_KEY
```

At minimum:
- `DATABASE_URL` — your Postgres
- `OPENAI_API_KEY` — optional but the AI flows fall back to mock output without it
- `STRIPE_TEST_KEY` — must be `sk_test_...`. The Stripe routine refuses to run against live keys.

### 3. Schema + seed

From the repo root:

```
npm install
npm run db:apply     # applies database/schema.sql (initial tables)
npm run db:migrate   # applies database/migrations/*.sql in order (auth, google oauth, ...)
npm run db:seed      # applies database/seed.sql (10 prospects, 5 accounts, ...)
```

After the first install you only need `db:migrate` when new migration files
arrive. `db:apply` is idempotent — re-running it is safe — but new tables
(`api_tokens`, `google_sub` column, etc.) are added by `db:migrate`.

### 4. Run

In two terminals:

```
npm run dev:backend     # backend on :3001
npm run dev:frontend    # frontend on :5173
```

Open http://localhost:5173.

---

## The three demo flows

The whole point of the prototype.

### Flow 1 — Paste → AI note

1. Copy any text (an email body, a transcript, an interview note).
2. Click anywhere on the canvas to defocus.
3. Paste (`Ctrl/Cmd + V`). The summarize modal opens prefilled.
4. Click **Create note**. The model picks a `node_type`, drafts a title and a
   short body, and the note appears on the canvas.
5. The note is selected automatically and editable in the right inspector.

If `OPENAI_API_KEY` is unset, the backend falls back to a deterministic
non-AI summary so the demo still runs end-to-end. The toast says so honestly.

### Flow 2 — Cmd+K → Draft reply

1. Click a `prospect`, `objection`, or `call_summary` note.
2. Press `Cmd/Ctrl + K`. The command palette opens.
3. Select **Draft email reply (from selected note)** or **Draft LinkedIn reply**.
4. A new `email_draft` or `linkedin_draft` note appears connected to the source
   note by an edge. The draft is in the body. The note is in `open` status —
   never auto-sent.

### Flow 3 — Shift+A → C → Stripe check

1. Press **Shift + A**, then **C** within ~1.2 s.
2. The backend hits Stripe `/v1/account` in test mode.
3. Outcomes:
   - **success** → a `resolved` "Stripe connection verified" note appears in the
     top-right cluster.
   - **needs_review** → an amber note explaining what was ambiguous.
   - **failed** → an amber note with the error and a "check the test key" hint.
4. The Run History panel (bottom-left) shows the run with its status pill.
5. Every run writes an `audit_log` entry: `automation.stripe.connection.check.<status>`.

The routine is **read-only**. It refuses to run if `STRIPE_TEST_KEY` starts
with `sk_live_`.

---

## Authentication

The dashboard requires a signed-in user. Two providers are available:

### Email + password (works out of the box)

1. Open http://localhost:5173 — you'll land on `/login`.
2. Click **Create one** to go to `/signup`.
3. Fill name, email, password (≥ 8 chars). Workspace name is optional.
4. You're signed in and on the canvas.

Each new signup creates its own private workspace. Team invites are a V2
feature.

### Sign in with Google (optional, ~5 minutes to set up)

If you don't configure Google OAuth, the "Continue with Google" button simply
doesn't appear. Email+password keeps working.

To enable:

1. **Create a Google Cloud project**
   - Go to https://console.cloud.google.com
   - Click the project picker → **New project** → name it anything → Create.

2. **Configure the OAuth consent screen**
   - Left sidebar: **APIs & Services → OAuth consent screen**
   - User Type: **External** → Create.
   - App name: `Sales Canvas` (or whatever).
   - User support email: your email.
   - Developer contact: your email. Save and continue.
   - Scopes: skip — defaults cover login.
   - Test users: add the Google account(s) you'll sign in with. Save.

3. **Create the OAuth client**
   - Left sidebar: **APIs & Services → Credentials**
   - **Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: `Sales Canvas dev` (or whatever).
   - **Authorized redirect URIs** — add exactly:
     ```
     http://localhost:5173/api/auth/google/callback
     ```
   - Create. Copy the **Client ID** and **Client secret**.

4. **Paste into `backend/.env`**
   ```
   GOOGLE_OAUTH_CLIENT_ID=<your client id>
   GOOGLE_OAUTH_CLIENT_SECRET=<your client secret>
   GOOGLE_OAUTH_REDIRECT_URI=http://localhost:5173/api/auth/google/callback
   ```

5. **Restart the backend**: `Ctrl+C` then `npm run dev:backend`.

6. **Test**: open http://localhost:5173 → the "Continue with Google" button
   should now appear above the email form.

#### Why `localhost:5173` and not `localhost:3001`?

In dev, the frontend (Vite, port 5173) proxies `/api/*` to the backend
(port 3001). Setting the redirect URI to the **frontend** origin means the
session cookie returned by the OAuth callback lands on the same origin the
user is browsing — so the canvas can read it immediately. In production
where backend and frontend are same-origin, point the redirect URI at your
production host's `/api/auth/google/callback`.

#### What scopes does it ask for?

Login only: `openid email profile`. No calendar / Gmail access until the
respective features are built (and those will ask for incremental consent at
that time, not at sign-in).

## Global capture (Chrome extension)

For capturing from outside the canvas tab — Gmail, docs, news articles —
load the `extension/` folder as an unpacked Chrome extension. Then **Alt+Shift+S**
anywhere captures the selection (or open Gmail thread) into a typed note. See
[extension/README.md](extension/README.md) for install + rebind instructions.

## Hotkeys

| Keys | Action |
|---|---|
| `Cmd/Ctrl + K` | Command palette |
| `N` | New blank note |
| `Ctrl/Cmd + Q` | Open the summarize modal |
| `Cmd/Ctrl + V` (off-focus) | Open summarize modal prefilled with clipboard text |
| `Shift + A` → `C` | Run Stripe connection check |
| `Esc` | Close palette / modal |

Hotkeys are ignored when focus is inside an input, textarea, or contenteditable
element.

---

## API surface

```
GET    /health
GET    /api/notes
POST   /api/notes
PATCH  /api/notes/:id
DELETE /api/notes/:id

GET    /api/edges
POST   /api/edges
DELETE /api/edges/:id

POST   /api/ai/summarize           { text, hint_type? }
POST   /api/ai/draft-reply         { source_note_id, channel: 'email'|'linkedin', intent? }

GET    /api/automations/routines
GET    /api/automations/runs
POST   /api/automations/run        { routine_key, trigger_type, trigger_payload, position? }

GET    /api/stats
GET    /api/audit-log
```

---

## Hard rules baked into the code

These are not aspirations; they are enforced.

- **No auto-send.** Every email/LinkedIn draft is created with `status='open'`
  and there is no send endpoint. Drafts are human-approved by design.
- **Stripe is read-only.** The routine never writes to Stripe. It refuses to
  run against a live key (`sk_live_*`).
- **No fake percentages.** The "stats" pills count real rows; they are not
  hardcoded.
- **Honest fallbacks.** If `OPENAI_API_KEY` is missing, the AI endpoints return
  deterministic fallback output and the frontend toast says so.
- **Audit everything sensitive.** Every status change, draft creation,
  automation run, and connector toggle writes an `audit_log` entry.

---

## What is intentionally NOT in V1

- Authentication / multi-user. Single workspace, single user.
- Gmail / Outlook ingestion.
- LinkedIn scraping or automation.
- Screenshot OCR. (Paste image planned in V2.)
- Box / group nodes. (Schema supports `box`; UI is flat notes only.)
- Zoom-based detail disclosure.
- Real-time collaboration.
- Production-grade error reporting / observability.

---

## Roadmap (next 10 things, in order)

1. Edge delete via UI (right-click).
2. Tag filtering on the canvas.
3. Search palette mode that drops you onto matching notes.
4. Box / group nodes for visual clustering.
5. Screenshot upload + OCR (Tesseract.js or vision API).
6. Read-only HubSpot connector mirroring the Stripe pattern.
7. Email connector (Gmail OAuth) with draft create, never send.
8. Workspace switching + simple auth.
9. Audit-log viewer UI.
10. Materialized "Manager dashboard" view of the canvas.
