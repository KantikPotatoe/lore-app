# Stable Storage Address + One-Click Launcher — Design

**Date:** 2026-06-14
**Status:** Approved (pending spec review)

## Context

The user relaunched the app and lost all their work. Root cause diagnosed: the app
stores data in IndexedDB, which browsers key to the exact origin — **scheme + host +
port**. The Vite dev server is not pinned to a port, so when `npm run dev` restarts and
the default port (5173) is busy, Vite silently drifts to the next free port (5174, 5175…).
A different port is a different origin with its own empty IndexedDB, so the previous
pages become invisible (not deleted — stranded at the old origin). Firefox re-prompting
for persistent storage confirmed the origin had changed.

The user has confirmed their existing data lives at **`localhost:5174`**.

This is not an IndexedDB or "web page vs. desktop app" problem — it is an address-drift
problem. The fix is to make the origin (and the browser) stable. A real desktop app
(Tauri) is explicitly deferred to much later.

## Goals

- Recover the user's existing pages (stranded at `localhost:5174`).
- Guarantee the dev/preview server always uses the same fixed port, failing loudly
  rather than drifting silently.
- Provide a one-click launcher that always opens the **same browser (Firefox)** at the
  **same address**, so the address-drift class of bug cannot recur.

## Non-Goals (YAGNI)

- No Electron/Tauri desktop app (deferred to later).
- No new storage engine or database migration — IndexedDB + JSON backup stays.
- No change to the existing backup/persistence features beyond what's needed here.

## Design

### Part 1 — Recover existing data (first, via the port pin)

Recovery is a consequence of the fix, not separate work. Once the server is pinned to
`5174` (Part 2) and the user opens it in Firefox, the stranded pages reappear because the
origin matches where the data already lives. Verification (Part 4) confirms the pages are
present before we consider the work done. If `5174` is unexpectedly empty, we try the
neighbouring ports (5173, 5175) to locate the data, but the user is confident it is 5174.

### Part 2 — Pin the port (`vite.config.ts`)

Add a fixed port with `strictPort` to both the dev server and the preview server:

```ts
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
})
```

`strictPort: true` is the crucial part: if `5174` is ever occupied, Vite now **exits with
a clear error** instead of sliding to another port and showing empty storage. This removes
the silent-drift failure mode entirely.

### Part 3 — One-click launcher (`start-lore-codex.cmd`)

A double-clickable Windows command file at the project root that:

1. Changes into the project directory (so it works regardless of where it's launched).
2. Opens **Firefox specifically** at `http://localhost:5174`.
3. Starts the dev server (`npm run dev`).

Opening Firefox explicitly matters as much as the fixed port: IndexedDB is tied to both
the browser *and* the origin. Launching a different browser would show empty storage —
the same class of bug. Pinning both browser and port closes every path back to data loss.

Sketch:

```bat
@echo off
cd /d "%~dp0"
start "" firefox "http://localhost:5174"
call npm run dev
```

The user can right-click this file → "Pin to Start" or send a desktop shortcut, so
launching feels like opening an app. A short note in `CLAUDE.md` / README documents it.

Edge cases:
- If Firefox opens before the server is ready, the first load may briefly error; once
  `npm run dev` is up, a refresh works. (Acceptable; Vite is up within ~1s.)
- If port 5174 is busy, `strictPort` makes the server fail with a clear message rather
  than drifting — the user closes whatever holds the port and relaunches.

### Part 4 — Verification

1. Run `start-lore-codex.cmd`; confirm Firefox opens at `localhost:5174`.
2. Confirm the user's recovered pages are listed (data recovery succeeded).
3. Fully close the browser and stop the server; relaunch via the `.cmd`.
4. Confirm the same pages are still present — proving relaunch-loss is fixed.
5. `npm run build` passes (no regressions).

## Files Touched

- `vite.config.ts` — add `server` + `preview` port pinning.
- `start-lore-codex.cmd` — new launcher (project root).
- `CLAUDE.md` (or `README`) — short "How to launch" note.

## Risks

- **Port 5174 occupied at launch:** mitigated by `strictPort` failing loudly; user frees
  the port. Low likelihood for a personal machine.
- **User opens the app the old way (typing a URL / different browser):** mitigated by
  making the `.cmd` the obvious, documented entry point. Long-term, a Tauri app removes
  this entirely.
