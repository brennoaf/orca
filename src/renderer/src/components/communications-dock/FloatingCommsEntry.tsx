import { useEffect, useState, type ReactElement } from 'react'
import { flushSync } from 'react-dom'
import type { CommunicationsDockSnapshot } from '../../../../shared/communications-dock'
import { CommunicationsDockRoot } from './CommunicationsDockRoot'

type FloatingCommsEntryProps = {
  reportError: (operation: string, error: unknown) => void
  surface: ReactElement
}

export function FloatingCommsEntry({
  reportError,
  surface
}: FloatingCommsEntryProps): React.JSX.Element {
  const [entry, setEntry] = useState<
    { mode: 'dock'; snapshot: CommunicationsDockSnapshot } | { mode: 'surface' } | null
  >(null)
  useEffect(() => {
    let disposed = false
    void Promise.resolve()
      .then(() => window.api.floatingCommsDock.getSnapshot())
      .then((snapshot) => {
        if (!disposed) {
          setEntry({ mode: 'dock', snapshot })
        }
      })
      .catch(() => {
        if (!disposed) {
          setEntry({ mode: 'surface' })
        }
      })
    return () => {
      disposed = true
    }
  }, [])
  if (!entry) {
    return <div className="h-screen bg-background" />
  }
  return entry.mode === 'dock' ? (
    <CommunicationsDockRoot
      initialSnapshot={entry.snapshot}
      reportError={reportError}
      onExit={() => flushSync(() => setEntry(null))}
    />
  ) : (
    surface
  )
}
