// Test setup — runs before every test file (see vitest.config.ts).
//
// fake-indexeddb/auto installs an in-memory IndexedDB on the global scope so
// modules that open a Dexie database at import time (db.ts) work under Node.
import 'fake-indexeddb/auto'
