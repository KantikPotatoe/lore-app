import { useNavigate } from 'react-router-dom'
import { updateScene, findPageIdByTitle, type Scene } from '../../db'
import LoreEditor from '../LoreEditor'
import SceneMetaPanel from './SceneMetaPanel'

export default function SceneEditor({ scene }: { scene: Scene }) {
  const navigate = useNavigate()

  async function followWikiLink(title: string) {
    const id = await findPageIdByTitle(title)
    if (id) navigate(`/page/${id}`)
  }

  return (
    <div className="scene-editor">
      <div className="scene-editor-main">
        <input
          className="scene-title-input"
          aria-label="Scene title"
          value={scene.title}
          onChange={(e) => updateScene(scene.id, { title: e.target.value })}
        />
        <LoreEditor
          content={scene.content}
          editable
          onChange={(html) => updateScene(scene.id, { content: html })}
          onWikiClick={followWikiLink}
        />
      </div>
      <SceneMetaPanel scene={scene} />
    </div>
  )
}
