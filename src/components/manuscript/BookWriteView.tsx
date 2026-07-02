import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db'
import BinderTree from './BinderTree'
import SceneEditor from './SceneEditor'

interface Props {
  bookId: string
  selectedSceneId: string | null
  onSelectScene: (id: string | null) => void
}

export default function BookWriteView({ bookId, selectedSceneId, onSelectScene }: Props) {
  const scene = useLiveQuery(
    () => (selectedSceneId ? db.scenes.get(selectedSceneId) : undefined),
    [selectedSceneId],
  )

  return (
    <div className="book-write">
      <BinderTree bookId={bookId} selectedSceneId={selectedSceneId} onSelectScene={onSelectScene} />
      <div className="book-write-main">
        {scene ? (
          <SceneEditor key={scene.id} scene={scene} />
        ) : (
          <p className="empty-hint">Select a scene to start writing.</p>
        )}
      </div>
    </div>
  )
}
