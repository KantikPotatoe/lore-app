import { Component, type ErrorInfo, type ReactNode } from 'react'
import { downloadBackup } from '../backup'

// ---------------------------------------------------------------------------
// Top-level error boundary (roadmap #7).
//
// A render crash anywhere in the tree would otherwise blank the whole app with no
// way out — and because the data lives only in this browser, the user's instinct
// (reload, or worse, clear site data) risks losing it. This boundary turns a crash
// into a recovery screen whose first action is a "download a backup" escape hatch,
// so the world can always be saved before anything else is tried.
// ---------------------------------------------------------------------------

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  busy: boolean
  backupDone: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, busy: false, backupDone: false }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Leave a console trail for debugging; user-facing recovery is the render below.
    console.error('Lore Codex crashed:', error, info.componentStack)
  }

  handleBackup = async (): Promise<void> => {
    this.setState({ busy: true })
    try {
      await downloadBackup()
      this.setState({ backupDone: true })
    } catch (e) {
      // The recovery screen is the last line of defence — don't let a failed
      // download throw again. Surface it in the console and leave the button usable.
      console.error('Backup from the recovery screen failed:', e)
    } finally {
      this.setState({ busy: false })
    }
  }

  handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    const { error, busy, backupDone } = this.state
    if (!error) return this.props.children

    return (
      <div className="crash-screen" role="alert">
        <div className="crash-card">
          <h1 className="crash-title">Something went wrong</h1>
          <p className="crash-lead">
            Lore Codex hit an unexpected error and can't continue. Your world is still
            saved in this browser — download a backup to be safe, then reload.
          </p>
          <div className="crash-actions">
            <button
              type="button"
              className="crash-btn-primary"
              disabled={busy}
              onClick={this.handleBackup}
            >
              {busy ? 'Downloading…' : backupDone ? '✓ Backup downloaded — download again' : 'Download a backup'}
            </button>
            <button type="button" className="crash-btn" onClick={this.handleReload}>
              Reload the app
            </button>
          </div>
          <details className="crash-details">
            <summary>Technical details</summary>
            <pre>{error.message}{error.stack ? `\n\n${error.stack}` : ''}</pre>
          </details>
        </div>
      </div>
    )
  }
}
