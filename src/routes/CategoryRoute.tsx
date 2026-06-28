import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createPage, categoryColor } from '../db'
import BrowseGrid from '../components/BrowseGrid'

const NO_PAGES: import('../db').LorePage[] = []

export default function CategoryRoute() {
  const { category = '' } = useParams<{ category: string }>()
  const navigate = useNavigate()

  const pages =
    useLiveQuery(
      () => db.pages.where('category').equals(category).sortBy('title'),
      [category],
    ) ?? NO_PAGES

  async function handleNew() {
    const id = await createPage({ category })
    navigate(`/page/${id}`)
  }

  return (
    <BrowseGrid
      title={category}
      titleColor={categoryColor(category)}
      action={
        <button className="primary-btn" onClick={handleNew}>
          + New {category}
        </button>
      }
      pages={pages}
      empty={{
        icon: '📭',
        title: `No ${category} pages yet`,
        message: `Use “+ New ${category}” above to create the first one.`,
      }}
    />
  )
}
