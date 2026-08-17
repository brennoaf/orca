import { useLayoutEffect, type RefObject } from 'react'
import type {
  CommunicationsDockIdentity,
  CommunicationsDockSnapshot
} from '../../../../shared/communications-dock'

export function useCommunicationsDockNavbarHeight(
  ready: boolean,
  headerRef: RefObject<HTMLDivElement | null>,
  run: (
    operation: string,
    request: (identity: CommunicationsDockIdentity) => Promise<CommunicationsDockSnapshot>
  ) => void
): void {
  useLayoutEffect(() => {
    if (!ready) {
      return
    }
    const header = headerRef.current
    if (!header) {
      return
    }
    const publishHeight = (): void => {
      const height = Math.round(header.getBoundingClientRect().height)
      run('resize dock navbar', (current) =>
        window.api.floatingCommsDock.setNavbarHeight({ ...current, height })
      )
    }
    publishHeight()
    const observer = new ResizeObserver(publishHeight)
    observer.observe(header)
    return () => observer.disconnect()
  }, [headerRef, ready, run])
}
