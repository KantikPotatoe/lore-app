import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db, applyStructure, removeStructure, updateBeat,
  type Scene, type Plotline, type Beat, type StructureType,
} from '../../db'
import { STRUCTURES } from '../../manuscriptStructures'

const NO_SCENES: Scene[] = []
const NO_PLOTLINES: Plotline[] = []
const NO_BEATS: Beat[] = []

export default function StructureControls({ bookId }: { bookId: string }) {
  const scenes = useLiveQuery(() => db.scenes.where('bookId').equals(bookId).sortBy('order'), [bookId]) ?? NO_SCENES
  const plotlines = useLiveQuery(() => db.plotlines.where('bookId').equals(bookId).toArray(), [bookId]) ?? NO_PLOTLINES
  const beats = useLiveQuery(() => db.beats.where('bookId').equals(bookId).toArray(), [bookId]) ?? NO_BEATS

  const structureLane = plotlines.find((p) => p.kind === 'structure')
  const unplaced = useMemo(
    () =>
      structureLane
        ? beats.filter((b) => b.plotlineId === structureLane.id && b.sceneId === null).sort((a, b) => a.order - b.order)
        : [],
    [beats, structureLane],
  )

  function onPick(value: string) {
    if (value === 'none') {
      if (structureLane && !confirm('Remove the story-structure track and its beats?')) return
      removeStructure(bookId)
      return
    }
    if (structureLane && !confirm('Replace the current story structure? Beat placements will be reset.')) return
    applyStructure(bookId, value as StructureType)
  }

  return (
    <div className="structure-controls">
      <label className="structure-pick">
        <span>Story structure</span>
        <select
          aria-label="Story structure"
          value={structureLane?.structureType ?? 'none'}
          onChange={(e) => onPick(e.target.value)}
        >
          <option value="none">None</option>
          {STRUCTURES.map((s) => (
            <option key={s.type} value={s.type}>{s.name}</option>
          ))}
        </select>
      </label>

      {structureLane && unplaced.length > 0 && (
        <div className="structure-tray">
          <span className="structure-tray-head">Unplaced beats</span>
          {unplaced.map((b) => (
            <div key={b.id} className="structure-tray-beat">
              <span className="structure-tray-label">{b.label}</span>
              <select
                aria-label={`assign beat ${b.label}`}
                value=""
                onChange={(e) => updateBeat(b.id, { sceneId: e.target.value })}
              >
                <option value="" disabled>Assign to scene…</option>
                {scenes.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
