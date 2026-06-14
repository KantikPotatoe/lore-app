# Stable Storage Address + One-Click Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the app from losing data on relaunch by pinning the dev/preview server to a fixed port and adding a one-click Firefox launcher, so the IndexedDB origin never drifts.

**Architecture:** IndexedDB is keyed to the origin (scheme + host + port). The Vite dev server currently auto-picks a free port, so a restart can land on a new port = a new, empty origin = "lost" data. Fix is two small, independent pieces: (1) pin the port with `strictPort` in `vite.config.ts` so it fails loudly instead of drifting; (2) a `start-lore-codex.cmd` launcher that always opens Firefox at the fixed `http://localhost:5174`, pinning both browser and port. No app-code or storage changes.

**Tech Stack:** Vite 8 config (TypeScript), a Windows `.cmd` batch script, Markdown docs. No test framework in this project — verification is run-and-observe.

---

## File Structure

- `vite.config.ts` — **modify**: add `server` and `preview` port pinning. Single responsibility: build/serve configuration.
- `start-lore-codex.cmd` — **create** (project root): the double-clickable launcher. Single responsibility: open Firefox at the fixed URL and start the dev server.
- `README.md` — **modify**: replace the "Running it" section with the launcher-based instructions and the port-drift warning.
- `CLAUDE.md` — **modify**: add a short note documenting the fixed port + launcher so future work doesn't reintroduce drift.

There are no automated tests in this repo (confirmed in `CLAUDE.md`), and these changes are config/scripts that can't be meaningfully unit-tested. Each task therefore verifies by running the real command and observing output, which is the correct verification for this kind of change.

---

### Task 1: Pin the dev and preview server to port 5174

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Replace the config with the pinned-port version**

Overwrite `vite.config.ts` with exactly this content:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// The port is PINNED on purpose. IndexedDB (where all lore is stored) is keyed
// to the exact origin — scheme + host + PORT. If the dev server drifted to a
// different port (e.g. 5173 -> 5174) on restart, the browser would show an empty
// database and the previous data would appear "lost" (it's stranded at the old
// port's origin). strictPort makes Vite fail loudly if 5174 is taken instead of
// silently moving to another port.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
})
```

- [ ] **Step 2: Start the dev server and confirm it binds to 5174**

Run: `npm run dev`
Expected: the printed URL is `http://localhost:5174/` (NOT 5173 or any other port). Leave it running for the next step, then stop it with Ctrl+C.

- [ ] **Step 3: Confirm strictPort fails loudly when the port is busy**

While the first `npm run dev` from Step 2 is STILL running, open a second terminal in the project directory and run: `npm run dev`
Expected: the second instance EXITS with an error like `Port 5174 is already in use` (it does NOT drift to 5175). This proves the silent-drift failure mode is gone.
Then stop both servers (Ctrl+C in each).

- [ ] **Step 4: Confirm the production build still works**

Run: `npm run build`
Expected: ends with `✓ built in <time>` and no TypeScript errors. (A "chunks larger than 500 kB" warning is pre-existing and fine.)

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts
git commit -m "Pin dev/preview server to port 5174 with strictPort

IndexedDB is keyed to origin (scheme+host+port). An unpinned dev server
could drift to a new port on restart, presenting an empty database and
making saved lore appear lost. strictPort now fails loudly instead of
drifting silently."
```

---

### Task 2: Add the one-click Firefox launcher

**Files:**
- Create: `start-lore-codex.cmd` (project root)

- [ ] **Step 1: Create the launcher script**

Create `start-lore-codex.cmd` with exactly this content:

```bat
@echo off
REM Lore Codex launcher.
REM Always opens the SAME browser (Firefox) at the SAME address so the
REM IndexedDB origin never changes. Do not change the port here without
REM also changing it in vite.config.ts — they must match, or data will
REM appear "lost" (see vite.config.ts for why).

cd /d "%~dp0"

REM Open Firefox at the fixed app URL. If the server isn't up yet the page
REM may briefly show an error; it loads once the dev server is ready.
start "" firefox "http://localhost:5174"

REM Start the dev server (stays running in this window; close it to stop).
call npm run dev
```

- [ ] **Step 2: Run the launcher and confirm Firefox opens at the right address**

Double-click `start-lore-codex.cmd` in File Explorer (or run `.\start-lore-codex.cmd` from PowerShell in the project root).
Expected:
- A terminal window opens and prints `http://localhost:5174/`.
- Firefox opens a tab at `http://localhost:5174` showing the Lore Codex app (after at most a refresh if it opened a hair early).

- [ ] **Step 3: Confirm the launcher works regardless of launch location**

Close the launcher window. From PowerShell in a DIFFERENT directory (e.g. `cd C:\`), run the script by full path:
Run: `& "C:\Users\esteb\Documents\Claude\Prog\lore-app\.claude\worktrees\feature+stable-storage-launcher\start-lore-codex.cmd"`
Expected: it still starts (the `cd /d "%~dp0"` line moves into the project dir first), prints `http://localhost:5174/`, and opens Firefox there. Close the window when confirmed.

> Note: in normal use this file lives at the repo root (`C:\Users\esteb\Documents\Claude\Prog\lore-app\start-lore-codex.cmd`). The worktree path above is only for verifying during implementation.

- [ ] **Step 4: Commit**

```bash
git add start-lore-codex.cmd
git commit -m "Add one-click Firefox launcher (start-lore-codex.cmd)

Double-clickable launcher that always opens Firefox at the fixed
http://localhost:5174 and starts the dev server, pinning both browser
and port so the IndexedDB origin can't drift."
```

---

### Task 3: Document the launcher and the fixed port

**Files:**
- Modify: `README.md` (replace the "Running it" section, lines ~19-33)
- Modify: `CLAUDE.md` (add a short note under Commands)

- [ ] **Step 1: Update the README "Running it" section**

In `README.md`, replace the entire "## Running it" section and its two code blocks (the current `npm install`/`npm run dev` block and the "Other commands" block) with:

```markdown
## Running it

You need [Node.js](https://nodejs.org) installed. First time only:

```bash
npm install      # downloads dependencies
```

After that, **double-click `start-lore-codex.cmd`** to launch. It opens
Firefox at `http://localhost:5174` and starts the app. Tip: right-click the
file → *Pin to Start* (or send a desktop shortcut) so it launches like an app.

> **Always launch this way.** Your lore is stored in Firefox under the exact
> address `localhost:5174`. Opening a *different* browser, or a different port,
> shows a *different* (empty) database — your data isn't gone, it's just tied to
> the original address. The launcher and the pinned port (`vite.config.ts`)
> guarantee you always return to the same place.

Other commands:

```bash
npm run dev      # start the app manually (also on port 5174)
npm run build    # type-check and produce an optimized build in dist/
npm run preview  # preview the production build locally (port 5174)
```
```

- [ ] **Step 2: Update the README backup note to reference the port**

In `README.md`, in the "## A note on backups" section, replace the sentence:

```markdown
Because your lore is stored in this browser's local storage, clearing site data
or switching browsers loses it. **Use Export backup regularly** and keep the JSON
files somewhere safe (or commit them to a private repo).
```

with:

```markdown
Because your lore is stored in this browser under `localhost:5174`, clearing site
data, switching browsers, or opening a different address shows an empty database.
Always launch with `start-lore-codex.cmd`, and **use Export backup regularly** —
keep the JSON files somewhere safe (or commit them to a private repo).
```

- [ ] **Step 3: Add a note to CLAUDE.md**

In `CLAUDE.md`, immediately after the closing ``` of the Commands code block (before the "There are no automated tests" line), insert this paragraph:

```markdown
The dev/preview server is **pinned to port 5174** (`strictPort` in `vite.config.ts`)
and launched via `start-lore-codex.cmd`, which always opens Firefox at
`http://localhost:5174`. This is deliberate: IndexedDB is keyed to the origin, so a
drifting port would present an empty database and make saved lore look lost. Do not
change the port in one place without changing it in the other.
```

- [ ] **Step 4: Verify the docs render sensibly**

Run: `git diff --stat`
Expected: shows `README.md` and `CLAUDE.md` modified. Visually re-read both changed sections to confirm the fenced code blocks are balanced (no stray ``` ).

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "Document the fixed port and one-click launcher

Explain why the app must always be launched via start-lore-codex.cmd at
localhost:5174, and warn that a different browser/port shows an empty DB."
```

---

### Task 4: Recover existing data and verify relaunch no longer loses it

This is the acceptance test for the whole change. It is performed by the user in Firefox (the agent cannot see the user's existing IndexedDB data).

**Files:** none (verification only)

- [ ] **Step 1: Recover the stranded pages**

Launch via `start-lore-codex.cmd`. In Firefox at `http://localhost:5174`, confirm the user's previously-created pages are listed in the sidebar.
Expected: the lost pages are present (they were stranded at this origin all along).
If the sidebar is empty: the data may be at a neighbouring port. Temporarily change `5174` to `5173` (then `5175`) in BOTH `vite.config.ts` and `start-lore-codex.cmd`, relaunch, and check. Once found, that becomes the pinned port. (User is confident it is 5174.)

- [ ] **Step 2: Make a fresh backup now that data is visible**

In the app, go to the Home screen and click **Back up now** (Export). Save the JSON somewhere safe.
Expected: a `lore-backup-<timestamp>.json` file downloads. This is a safety net before further testing.

- [ ] **Step 3: Prove the relaunch-loss is fixed**

Fully close Firefox AND close the launcher terminal window (stopping the server). Then launch again via `start-lore-codex.cmd`.
Expected: Firefox reopens at `localhost:5174` and the SAME pages are still listed. Restarting no longer loses data.

- [ ] **Step 4: Confirm persistent storage is granted**

In the running app, open the browser console (F12) and run: `await navigator.storage.persisted()`
Expected: `true`. If `false`, click **Make persistent** on the Home screen (or accept Firefox's prompt) and re-check. This stops Firefox from evicting the data under storage pressure.

---

## Notes for the implementer

- **No app code changes.** If you find yourself editing anything under `src/`, stop — that's out of scope for this plan.
- **Port consistency is the one invariant.** The port appears in exactly two files (`vite.config.ts` and `start-lore-codex.cmd`) plus the docs. If you ever change it, change all of them together.
- **The launcher ships at the repo root.** During implementation it lives in the worktree; the path differences only matter for the verification steps in Task 2.
