import { useState, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  listLores,
  currentLoreId,
  switchLore,
  createLore,
  renameLore,
  deleteLore,
  setLoreBanner,
  type Lore,
} from '../lores'
import { compressImage } from '../imageUtils'
import ConfirmDialog from '../components/ConfirmDialog'

export default function LoreSelectorRoute() {
  const [pendingDelete, setPendingDelete] = useState<Lore | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [creating, setCreating] = useState(false)
  const bannerInputRef = useRef<HTMLInputElement>(null)
  const [bannerTargetId, setBannerTargetId] = useState<string | null>(null)

  const lores = useLiveQuery(listLores, []) ?? []
  const activeId = currentLoreId()

  async function handleCreate() {
    setCreating(true)
    await createLore() // triggers reload — setCreating never resolves visually
  }

  function startRename(lore: Lore) {
    setRenamingId(lore.id)
    setRenameValue(lore.name)
  }

  async function commitRename(id: string) {
    await renameLore(id, renameValue)
    setRenamingId(null)
  }

  async function handleBannerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !bannerTargetId) return
    const dataUrl = await compressImage(file, 1200)
    await setLoreBanner(bannerTargetId, dataUrl)
    e.target.value = ''
    setBannerTargetId(null)
  }

  function openBannerPicker(id: string) {
    setBannerTargetId(id)
    bannerInputRef.current?.click()
  }

  return (
    <div className="lore-selector">
      <div className="lore-selector-header">
        <h1>Your Worlds</h1>
        <button
          className="primary-btn"
          onClick={handleCreate}
          disabled={creating}
        >
          {creating ? 'Creating…' : '＋ New World'}
        </button>
      </div>

      <div className="lore-grid">
        {lores.map((lore) => (
          <div
            key={lore.id}
            className={`world-card${lore.id === activeId ? ' world-card--active' : ''}`}
          >
            {/* Banner / placeholder */}
            <div
              className="world-card-banner"
              onClick={() => switchLore(lore.id)}
              style={lore.banner ? { backgroundImage: `url(${lore.banner})` } : undefined}
            >
              {!lore.banner && (
                <span className="world-card-initial">
                  {lore.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            {/* Card body */}
            <div className="world-card-body">
              {renamingId === lore.id ? (
                <input
                  className="lore-rename-input"
                  value={renameValue}
                  autoFocus
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(lore.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(lore.id)
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                />
              ) : (
                <button
                  className="world-card-name"
                  onClick={() => switchLore(lore.id)}
                  title="Open this world"
                >
                  {lore.name}
                </button>
              )}

              <span className="world-card-date">
                Created {new Date(lore.createdAt).toLocaleDateString()}
              </span>

              <div className="world-card-actions">
                <button className="ghost-btn" onClick={() => startRename(lore)}>✎ Rename</button>
                <button className="ghost-btn" onClick={() => openBannerPicker(lore.id)}>🖼 Banner</button>
                <button className="ghost-btn danger" onClick={() => setPendingDelete(lore)}>✕ Delete</button>
              </div>
            </div>
          </div>
        ))}

        {lores.length === 0 && (
          <p className="empty-hint">No worlds yet. Create your first one!</p>
        )}
      </div>

      {/* Hidden banner file input */}
      <input
        ref={bannerInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleBannerChange}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={pendingDelete !== null}
        danger
        title={`Delete "${pendingDelete?.name}"?`}
        confirmLabel="Delete world"
        cancelLabel="Cancel"
        onConfirm={async () => {
          if (pendingDelete) {
            await deleteLore(pendingDelete.id)
            setPendingDelete(null)
          }
        }}
        onCancel={() => setPendingDelete(null)}
      >
        <p>This permanently deletes all pages, maps, templates, and snapshots in this world. <strong>This cannot be undone.</strong></p>
      </ConfirmDialog>
    </div>
  )
}
