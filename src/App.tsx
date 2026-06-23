import { useEffect, useState } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { liveQuery } from 'dexie'
import Sidebar from './components/Sidebar'
import BackupBanner from './components/BackupBanner'
import StorageErrorBanner from './components/StorageErrorBanner'
import SearchModal from './components/SearchModal'
import WikiLinkPopover from './components/WikiLinkPopover'
import HomeRoute from './routes/HomeRoute'
import PageRoute from './routes/PageRoute'
import MapRoute from './routes/MapRoute'
import TemplatesRoute from './routes/TemplatesRoute'
import CategoryRoute from './routes/CategoryRoute'
import GraphRoute from './routes/GraphRoute'
import TimelineRoute from './routes/TimelineRoute'
import LoreSelectorRoute from './routes/LoreSelectorRoute'
import { requestPersistentStorage } from './backup'
import { seedTemplates, seedDefaultCalendar, db } from './db'
import { maybeTakeSnapshot } from './snapshots'
import { syncIndex } from './search'
import { bootstrapDefaultLore } from './lores'
import { installStorageErrorListener } from './storageError'

export default function App() {
  const location = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    installStorageErrorListener() // surface IndexedDB quota/eviction write failures
    bootstrapDefaultLore()
    requestPersistentStorage()
    seedTemplates()
    seedDefaultCalendar()
    maybeTakeSnapshot()
  }, [])

  // Keep the FlexSearch index in sync as pages change. The liveQuery emits the whole
  // table on every edit, but syncIndex only re-indexes the deltas (see search.ts) —
  // the first emission builds, later ones apply just the changed/added/removed pages.
  useEffect(() => {
    const sub = liveQuery(() => db.pages.toArray()).subscribe((pages) => {
      syncIndex(pages)
    })
    return () => sub.unsubscribe()
  }, [])

  // Lore selector: full-screen, no sidebar/overlays (but still surface storage errors)
  if (location.pathname === '/') {
    return (
      <>
        <StorageErrorBanner />
        <LoreSelectorRoute />
      </>
    )
  }

  // All other routes: existing sidebar shell
  return (
    <div className="app-shell">
      <StorageErrorBanner />
      <Sidebar onOpenSearch={() => setSearchOpen(true)} />
      <main className="content">
        <BackupBanner />
        <Routes>
          <Route path="/home" element={<HomeRoute />} />
          <Route path="/page/:id" element={<PageRoute />} />
          <Route path="/map" element={<MapRoute />} />
          <Route path="/graph" element={<GraphRoute />} />
          <Route path="/timeline" element={<TimelineRoute />} />
          <Route path="/templates" element={<TemplatesRoute />} />
          <Route path="/browse/:category" element={<CategoryRoute />} />
        </Routes>
      </main>
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
      <WikiLinkPopover />
    </div>
  )
}
