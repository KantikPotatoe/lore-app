import { defineConfig } from 'vitest/config'

// Vitest config is kept separate from vite.config.ts so the deliberately
// pinned dev/preview server settings there stay untouched.
//
// `environment: 'happy-dom'` gives tests a DOM (needed by src/html.ts's
// DOMParser-based helpers and by anything that imports db.ts, which constructs
// a Dexie instance). `setup-tests.ts` installs fake-indexeddb so importing
// db.ts doesn't touch a real browser database.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/setup-tests.ts'],
    include: ['src/**/*.test.ts'],
  },
})
