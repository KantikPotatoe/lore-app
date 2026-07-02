import { useParams } from 'react-router-dom'

export default function BookRoute() {
  const { bookId } = useParams<{ bookId: string }>()
  return (
    <div className="book-workspace">
      <h1 className="page-title">Book {bookId}</h1>
    </div>
  )
}
