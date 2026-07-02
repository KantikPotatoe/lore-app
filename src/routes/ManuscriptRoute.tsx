import { useLiveQuery } from 'dexie-react-hooks'
import { Link, useNavigate } from 'react-router-dom'
import { db, createBook, type Book } from '../db'

const NO_BOOKS: Book[] = []

export default function ManuscriptRoute() {
  const navigate = useNavigate()
  const books = useLiveQuery(() => db.books.orderBy('order').toArray(), []) ?? NO_BOOKS

  async function handleNew() {
    const book = await createBook('Untitled Book')
    navigate(`/book/${book.id}`)
  }

  return (
    <div className="manuscript-page">
      <div className="manuscript-head">
        <h1 className="page-title">Manuscript</h1>
        <button className="primary-btn" onClick={handleNew}>＋ New book</button>
      </div>
      {books.length === 0 ? (
        <p className="empty-hint">No books yet. Start your first manuscript!</p>
      ) : (
        <div className="book-grid">
          {books.map((b) => (
            <Link key={b.id} to={`/book/${b.id}`} className="book-card">
              <span className="book-card-title">{b.title}</span>
              {b.synopsis && <span className="book-card-synopsis">{b.synopsis}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
