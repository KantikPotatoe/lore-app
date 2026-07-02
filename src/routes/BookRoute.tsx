import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import BookWriteView from '../components/manuscript/BookWriteView'

export default function BookRoute() {
  const { bookId } = useParams<{ bookId: string }>()
  const [view, setView] = useState<'write' | 'grid'>('write')
  const [searchParams, setSearchParams] = useSearchParams()
  const book = useLiveQuery(() => (bookId ? db.books.get(bookId) : undefined), [bookId])

  const selectedSceneId = searchParams.get('scene')
  function selectScene(id: string | null) {
    setSearchParams(id ? { scene: id } : {}, { replace: true })
  }

  if (!bookId) return null

  return (
    <div className="book-workspace">
      <div className="book-head">
        <h1 className="page-title">{book?.title ?? 'Book'}</h1>
        <div className="seg-control">
          <button className={view === 'write' ? 'seg active' : 'seg'} onClick={() => setView('write')}>Write</button>
          <button className={view === 'grid' ? 'seg active' : 'seg'} onClick={() => setView('grid')}>Grid</button>
        </div>
      </div>
      {view === 'write' ? (
        <BookWriteView bookId={bookId} selectedSceneId={selectedSceneId} onSelectScene={selectScene} />
      ) : (
        <div className="book-grid-view empty-hint">The plotline grid arrives in a later update.</div>
      )}
    </div>
  )
}
