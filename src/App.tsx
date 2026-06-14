import { useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import BackupBanner from './components/BackupBanner'
import HomeRoute from './routes/HomeRoute'
import PageRoute from './routes/PageRoute'
import MapRoute from './routes/MapRoute'
import TemplatesRoute from './routes/TemplatesRoute'
import CategoryRoute from './routes/CategoryRoute'
import { requestPersistentStorage } from './backup'
import { seedTemplates } from './db'

export default function App() {
  // Ask the browser to keep our data persistently so it isn't auto-evicted, and
  // make sure the built-in infobox templates exist.
  useEffect(() => {
    requestPersistentStorage()
    seedTemplates()
  }, [])

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="content">
        <BackupBanner />
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/page/:id" element={<PageRoute />} />
          <Route path="/map" element={<MapRoute />} />
          <Route path="/templates" element={<TemplatesRoute />} />
          <Route path="/browse/:category" element={<CategoryRoute />} />
        </Routes>
      </main>
    </div>
  )
}
