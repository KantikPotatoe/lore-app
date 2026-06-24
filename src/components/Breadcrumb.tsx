import { Link } from 'react-router-dom'

export default function Breadcrumb({
  category,
  title,
  color,
}: {
  category: string
  title: string
  color: string
}) {
  return (
    <nav className="page-breadcrumb" aria-label="Breadcrumb">
      <Link
        to={`/browse/${encodeURIComponent(category)}`}
        className="page-crumb-link"
        style={{ color }}
      >
        {category}
      </Link>
      <span className="page-crumb-sep">›</span>
      <span className="page-crumb-current">{title}</span>
    </nav>
  )
}
