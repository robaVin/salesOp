# Sales Canvas — Capture extension

Global hotkey: **Alt+Shift+S** (rebindable). Works in any tab — Gmail, a doc,
a news article, anything. Captures the selected text (or the open Gmail thread
if nothing is selected) into Sales Canvas as a typed note.

Why not `Ctrl+Alt+S`? Chrome's MV3 validator rejects `Ctrl+Alt+<letter>`
combinations because on European keyboard layouts `Ctrl+Alt = AltGr`, which is
used to type `@`, `€`, `\`, etc. Allowing it would break those keyboards.
`Alt+Shift+S` is the cleanest universally-accepted default. You can try to
override to `Ctrl+Alt+S` (or anything else) via
**chrome://extensions/shortcuts** after install — the runtime UI is slightly
more permissive than the manifest validator.

This is a **Manifest V3** Chrome / Edge / Brave extension. ~150 lines of JS.

---

## Install (dev mode)

1. Make sure the Sales Canvas backend is running on `http://localhost:3001`
   (and ideally the frontend on `http://localhost:5173`).
2. Open Chrome and go to **chrome://extensions**.
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked**.
5. Pick `C:\york\sales-canvas\extension` (this folder).
6. The extension shows up with a default puzzle-piece icon. Pin it to the
   toolbar so you can click it as a fallback.

That's it. Press **Alt+Shift+S** on any tab.

---

## What gets captured

- **If you have text selected on the page**: just the selection.
- **Otherwise, if you're on `mail.google.com`**: the subject + all visible
  message bodies in the open conversation (truncated to ~8 KB).
- **Otherwise**: a notification telling you to select something first.

The capture flow is:

```
Alt+Shift+S
   ↓
chrome.scripting.executeScript injects extractText into the active tab
   ↓
POST http://localhost:3001/api/capture { text, source_url, source_title, source_kind }
   ↓
backend summarizes (or falls back deterministically if no OPENAI_API_KEY)
   ↓
backend inserts a typed note in the top-right cluster
   ↓
notification: "Note created · click to open"
   ↓
clicking the notification opens (or focuses) http://localhost:5173
```

The canvas auto-refetches when it regains focus, so the new note appears
immediately when you switch back.

---

## Rebinding the hotkey

Open **chrome://extensions/shortcuts**, find **Sales Canvas — Capture**, and
change the binding to anything you like. Chrome's runtime UI is slightly more
permissive than the manifest validator — combos that the manifest can't
suggest as defaults can sometimes still be bound here.

---

## Pointing the extension at a different backend / canvas

The defaults are baked in:

- Backend: `http://localhost:3001`
- Canvas: `http://localhost:5173`

To override (for a remote deployment), open the extension's service worker
DevTools (chrome://extensions → "Service worker" link under this extension)
and run:

```js
chrome.storage.local.set({
  backendUrl: 'https://api.your-host.example',
  canvasUrl: 'https://canvas.your-host.example',
})
```

The next capture uses the new values.

The backend already accepts requests from any `chrome-extension://` origin via
CORS, so no env changes are needed on the server side when you swap hosts —
just make sure the `host_permissions` in `manifest.json` cover the new
backend URL.

---

## Permissions, explained

| Permission | Why |
|---|---|
| `activeTab` | Read the page where you pressed the hotkey |
| `scripting` | Inject the extractText function into that page |
| `notifications` | Show "Note created" / error toasts |
| `tabs` | Find an existing canvas tab to focus on click |
| `storage` | Remember overrides for backend/canvas URLs |
| `host_permissions: localhost:3001` | Send the capture to the backend |
| `host_permissions: localhost:5173` | Focus the canvas tab |
| `host_permissions: mail.google.com` | Read the open Gmail thread |

No remote code execution. No telemetry. No analytics.

---

## What it does NOT do

- Capture from `chrome://`, `chrome-extension://`, or PDF viewer tabs (Chrome
  blocks `scripting.executeScript` there). The notification tells you so.
- Send anything to a third party. Capture goes only to your local backend.
- Auto-focus the canvas tab on capture. You decide when to switch — click the
  notification.
- Work in Firefox out of the box. Firefox uses `browser.*` namespaces and a
  slightly different `commands` syntax. A parallel manifest is straightforward
  if you want it later.

---

## Quick test

1. Backend + frontend running.
2. Extension loaded.
3. Open this README in your browser.
4. Select the first paragraph.
5. Press **Alt+Shift+S**.
6. Notification: "Note created · click to open".
7. Click it. Canvas tab opens or focuses. A new note appears in the top-right
   cluster, type and title chosen by the model (or a deterministic fallback if
   `OPENAI_API_KEY` is not set).

If the notification says "Capture failed: HTTP 500" — check the backend logs.
If "Backend unreachable" — start the backend with `npm run dev:backend`.
