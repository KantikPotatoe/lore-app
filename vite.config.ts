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
