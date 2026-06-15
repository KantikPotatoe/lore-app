import { useEffect, useState } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { liveQuery } from 'dexie'
import Sidebar from './components/Sidebar'
import BackupBanner from './components/BackupBanner'
import SearchModal from './components/SearchModal'
import WikiLinkPopover from './components/WikiLinkPopover'
import HomeRoute from './routes/HomeRoute'
import PageRoute from './routes/PageRoute'
import MapRoute from './routes/MapRoute'
import TemplatesRoute from './routes/TemplatesRoute'
import CategoryRoute from './routes/CategoryRoute'
import GraphRoute from './routes/GraphRoute'
import LoreSelectorRoute from './routes/LoreSelectorRoute'
import { requestPersistentStorage } from './backup'
import { seedTemplates, seedDefaultCalendar, db } from './db'
import { maybeTakeSnapshot } from './snapshots'
import { buildIndex } from './search'
import { bootstrapDefaultLore } from './lores'

export default function App() {
  const location = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    bootstrapDefaultLore()
    requestPersistentStorage()
    seedTemplates()
    seedDefaultCalendar()
    maybeTakeSnapshot()
  }, [])

  // Rebuild the FlexSearch index whenever pages change.
  useEffect(() => {
    const sub = liveQuery(() => db.pages.toArray()).subscribe((pages) => {
      buildIndex(pages)
    })
    return () => sub.unsubscribe()
  }, [])

  // Lore selector: full-screen, no sidebar/overlays
  if (location.pathname === '/') {
    return <LoreSelectorRoute />
  }

  // All other routes: existing sidebar shell
  return (
    <div className="app-shell">
      <Sidebar onOpenSearch={() => setSearchOpen(true)} />
      <main className="content">
        <BackupBanner />
        <Routes>
          <Route path="/home" element={<HomeRoute />} />
          <Route path="/page/:id" element={<PageRoute />} />
          <Route path="/map" element={<MapRoute />} />
          <Route path="/graph" element={<GraphRoute />} />
          <Route path="/templates" element={<TemplatesRoute />} />
          <Route path="/browse/:category" element={<CategoryRoute />} />
        </Routes>
      </main>
      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
      <WikiLinkPopover />
    </div>
  )
}
