import { updateScene, SCENE_STATUSES, type Scene, type SceneStatus } from '../../db'
import PagePicker from '../PagePicker'

export default function SceneMetaPanel({ scene }: { scene: Scene }) {
  return (
    <aside className="scene-meta">
      <label className="scene-meta-row">
        <span>Status</span>
        <select
          aria-label="Status"
          value={scene.status}
          onChange={(e) => updateScene(scene.id, { status: e.target.value as SceneStatus })}
        >
          {SCENE_STATUSES.map((s) => (
            <option key={s.name} value={s.name}>{s.label}</option>
          ))}
        </select>
      </label>

      <label className="scene-meta-row">
        <span>Word goal</span>
        <input
          type="number"
          min={0}
          value={scene.targetWordCount ?? ''}
          onChange={(e) =>
            updateScene(scene.id, {
              targetWordCount: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
      </label>

      <div className="scene-meta-row scene-meta-col">
        <span>POV</span>
        <PagePicker
          value={scene.povPageId ? [scene.povPageId] : []}
          multiple={false}
          placeholder="POV character…"
          onChange={(ids) => updateScene(scene.id, { povPageId: ids[0] ?? null })}
        />
      </div>

      <div className="scene-meta-row scene-meta-col">
        <span>Cast</span>
        <PagePicker
          value={scene.castPageIds}
          placeholder="Characters present…"
          onChange={(ids) => updateScene(scene.id, { castPageIds: ids })}
        />
      </div>

      <div className="scene-meta-row scene-meta-col">
        <span>Location</span>
        <PagePicker
          value={scene.locationPageIds}
          placeholder="Setting…"
          onChange={(ids) => updateScene(scene.id, { locationPageIds: ids })}
        />
      </div>

      <label className="scene-meta-row scene-meta-col">
        <span>Synopsis</span>
        <textarea
          aria-label="Synopsis"
          value={scene.synopsis}
          onChange={(e) => updateScene(scene.id, { synopsis: e.target.value })}
        />
      </label>

      <label className="scene-meta-row scene-meta-col">
        <span>Notes</span>
        <textarea
          aria-label="Notes"
          value={scene.notes}
          onChange={(e) => updateScene(scene.id, { notes: e.target.value })}
        />
      </label>
    </aside>
  )
}
