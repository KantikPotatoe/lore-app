import { Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import HomeRoute from './routes/HomeRoute'
import PageRoute from './routes/PageRoute'
import MapRoute from './routes/MapRoute'

export default function App() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="content">
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/page/:id" element={<PageRoute />} />
          <Route path="/map" element={<MapRoute />} />
        </Routes>
      </main>
    </div>
  )
}
