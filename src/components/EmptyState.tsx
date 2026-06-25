import type { ReactNode } from 'react'

interface EmptyStateProps {
  /** Decorative emoji ornament. */
  icon: string
  /** Warm one-line invitation. */
  title: string
  /** Optional secondary line. */
  message?: ReactNode
  /** Optional call(s) to action. */
  children?: ReactNode
}

/** Designed empty / first-run state: an ornament, a warm line, an optional
 *  message, and an optional CTA. Shared across the barren screens (no pages,
 *  empty category, no map, no timeline events, empty graph). */
export default function EmptyState({ icon, title, message, children }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-ornament" aria-hidden="true">{icon}</div>
      <h2 className="empty-state-title">{title}</h2>
      {message && <p className="empty-state-msg">{message}</p>}
      {children && <div className="empty-state-actions">{children}</div>}
    </div>
  )
}
