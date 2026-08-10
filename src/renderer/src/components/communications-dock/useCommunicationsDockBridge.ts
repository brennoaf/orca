import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CommunicationsDockIdentity,
  CommunicationsDockSnapshot
} from '../../../../shared/communications-dock'

export function shouldAcceptCommunicationsDockSnapshot(
  current: CommunicationsDockSnapshot | null,
  next: CommunicationsDockSnapshot
): boolean {
  return (
    !current ||
    next.generation > current.generation ||
    (next.generation === current.generation && next.revision >= current.revision)
  )
}

function identityOf(snapshot: CommunicationsDockSnapshot): CommunicationsDockIdentity {
  return { generation: snapshot.generation, revision: snapshot.revision }
}

export function useCommunicationsDockBridge(
  initialSnapshot: CommunicationsDockSnapshot,
  reportError: (operation: string, error: unknown) => void
): {
  snapshot: CommunicationsDockSnapshot
  ready: boolean
  run: (
    operation: string,
    request: (identity: CommunicationsDockIdentity) => Promise<CommunicationsDockSnapshot>
  ) => void
  runVoid: (
    operation: string,
    request: (identity: CommunicationsDockIdentity) => Promise<void>
  ) => void
} {
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const [ready, setReady] = useState(false)
  const snapshotRef = useRef(snapshot)
  const queueRef = useRef(Promise.resolve())
  snapshotRef.current = snapshot

  const accept = useCallback((next: CommunicationsDockSnapshot): void => {
    if (!shouldAcceptCommunicationsDockSnapshot(snapshotRef.current, next)) {
      return
    }
    snapshotRef.current = next
    setSnapshot(next)
  }, [])

  useEffect(() => {
    let disposed = false
    const off = window.api.floatingCommsDock.onSnapshotChanged((next) => {
      if (!disposed) {
        accept(next)
      }
    })
    const initialize = async (): Promise<void> => {
      const ready = await window.api.floatingCommsDock.ready({
        generation: initialSnapshot.generation
      })
      if (disposed) {
        return
      }
      accept(ready)
      await window.api.floatingCommsDock.ack(identityOf(ready))
      if (!disposed) {
        setReady(true)
      }
    }
    void initialize().catch((error: unknown) => reportError('initialize dock', error))
    return () => {
      disposed = true
      off()
    }
  }, [accept, initialSnapshot.generation, reportError])

  const enqueue = useCallback((task: () => Promise<void>): void => {
    queueRef.current = queueRef.current.then(task, task)
  }, [])

  const run = useCallback(
    (
      operation: string,
      request: (identity: CommunicationsDockIdentity) => Promise<CommunicationsDockSnapshot>
    ): void => {
      enqueue(async () => {
        try {
          const next = await request(identityOf(snapshotRef.current))
          accept(next)
        } catch (error) {
          reportError(operation, error)
          try {
            accept(await window.api.floatingCommsDock.getSnapshot())
          } catch (refreshError) {
            reportError('refresh dock', refreshError)
          }
        }
      })
    },
    [accept, enqueue, reportError]
  )

  const runVoid = useCallback(
    (operation: string, request: (identity: CommunicationsDockIdentity) => Promise<void>): void => {
      enqueue(async () => {
        try {
          await request(identityOf(snapshotRef.current))
        } catch (error) {
          reportError(operation, error)
        }
      })
    },
    [enqueue, reportError]
  )

  return { snapshot, ready, run, runVoid }
}
