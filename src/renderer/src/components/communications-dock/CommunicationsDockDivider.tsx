import { useCallback, useEffect, useRef, useState } from 'react'
import { clampCommunicationsDockRatio } from '../../../../shared/communications-dock'
import { cn } from '@/lib/utils'

const KEYBOARD_STEP = 0.05

export function CommunicationsDockDivider({
  direction,
  ratio,
  onRatioChange
}: {
  direction: 'horizontal' | 'vertical'
  ratio: number
  onRatioChange: (ratio: number) => void
}): React.JSX.Element {
  const horizontal = direction === 'horizontal'
  const [dragging, setDragging] = useState(false)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => () => cleanupRef.current?.(), [])

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      if (cleanupRef.current) {
        return
      }
      const handle = event.currentTarget
      const container = handle.parentElement
      const firstPane = handle.previousElementSibling as HTMLElement | null
      const secondPane = handle.nextElementSibling as HTMLElement | null
      if (!container || !firstPane || !secondPane) {
        return
      }
      setDragging(true)
      handle.setPointerCapture(event.pointerId)
      let rect = container.getBoundingClientRect()
      let nextRatio: number | null = null
      const observer = new ResizeObserver(() => {
        rect = container.getBoundingClientRect()
      })
      observer.observe(container)
      const handleMove = (moveEvent: PointerEvent): void => {
        if (moveEvent.pointerId !== event.pointerId || !handle.hasPointerCapture(event.pointerId)) {
          return
        }
        const rawRatio = horizontal
          ? (moveEvent.clientX - rect.left) / rect.width
          : (moveEvent.clientY - rect.top) / rect.height
        const clamped = clampCommunicationsDockRatio(rawRatio)
        nextRatio = clamped
        firstPane.style.flex = `${clamped} 1 0%`
        secondPane.style.flex = `${1 - clamped} 1 0%`
      }
      let cleaned = false
      const cleanup = (): void => {
        if (cleaned) {
          return
        }
        cleaned = true
        observer.disconnect()
        setDragging(false)
        if (nextRatio !== null) {
          onRatioChange(nextRatio)
        }
        if (handle.hasPointerCapture(event.pointerId)) {
          handle.releasePointerCapture(event.pointerId)
        }
        handle.removeEventListener('pointermove', handleMove)
        handle.removeEventListener('pointerup', handleEnd)
        handle.removeEventListener('pointercancel', handleEnd)
        handle.removeEventListener('lostpointercapture', handleEnd)
        if (cleanupRef.current === cleanup) {
          cleanupRef.current = null
        }
      }
      const handleEnd = (endEvent: PointerEvent): void => {
        if (endEvent.pointerId === event.pointerId) {
          cleanup()
        }
      }
      handle.addEventListener('pointermove', handleMove)
      handle.addEventListener('pointerup', handleEnd)
      handle.addEventListener('pointercancel', handleEnd)
      handle.addEventListener('lostpointercapture', handleEnd)
      cleanupRef.current = cleanup
    },
    [horizontal, onRatioChange]
  )

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const decrement = horizontal ? event.key === 'ArrowLeft' : event.key === 'ArrowUp'
    const increment = horizontal ? event.key === 'ArrowRight' : event.key === 'ArrowDown'
    if (!decrement && !increment && event.key !== 'Home' && event.key !== 'End') {
      return
    }
    event.preventDefault()
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? 1
          : ratio + (increment ? KEYBOARD_STEP : -KEYBOARD_STEP)
    onRatioChange(clampCommunicationsDockRatio(next))
  }

  return (
    <div
      role="separator"
      aria-orientation={horizontal ? 'vertical' : 'horizontal'}
      aria-valuemin={15}
      aria-valuemax={85}
      aria-valuenow={Math.round(ratio * 100)}
      tabIndex={0}
      className={cn(
        'tab-group-split-resize-handle z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        horizontal ? 'is-vertical' : 'is-horizontal',
        dragging && 'is-dragging'
      )}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
    />
  )
}
