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
