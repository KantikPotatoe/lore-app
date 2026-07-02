import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { sceneAppearances, type AppearanceRole } from '../db'

const ROLE_LABEL: Record<AppearanceRole, string> = {
  pov: 'POV',
  cast: 'Cast',
  location: 'Location',
  mention: 'Mention',
}

/** "Appears in": manuscript scenes that reference this page (POV/cast/location
 *  refs or inline wiki links). Distinct from wiki backlinks. Quiet when empty. */
export default function SceneAppearances({ pageId }: { pageId: string }) {
  const appearances = useLiveQuery(() => sceneAppearances(pageId), [pageId])

  if (!appearances || appearances.length === 0) return null

  return (
    <div className="appears-in">
      <div className="appears-in-head">Appears in <span className="backlinks-count">{appearances.length}</span></div>
      <ul className="appears-in-list">
        {appearances.map((a) => (
          <li key={a.sceneId}>
            <Link to={`/book/${a.bookId}?scene=${a.sceneId}`} className="appears-in-row">
              <span className="appears-in-scene">{a.sceneTitle}</span>
              <span className="appears-in-loc">{a.bookTitle} › {a.chapterTitle}</span>
            </Link>
            <span className="appears-in-roles">
              {a.roles.map((r) => (
                <span key={r} className="appears-in-role">{ROLE_LABEL[r]}</span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
