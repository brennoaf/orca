import { useEffect, useRef, useState } from 'react'

type PlaybackAnchor = {
  durationMs: number
  positionMs: number
  playing: boolean
  receivedAt: number
}

function clampPosition(positionMs: number, durationMs: number): number {
  return Math.min(durationMs, Math.max(0, positionMs))
}

function formatPlaybackTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function scheduleProgressTick(callback: () => void): number {
  return window.setTimeout(callback, 250)
}

export function useSpotifyPlaybackProgress(input: {
  durationMs: number
  positionMs: number
  playing: boolean
}) {
  const fillRef = useRef<HTMLDivElement>(null)
  const progressBarRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<PlaybackAnchor>({
    durationMs: 0,
    positionMs: 0,
    playing: false,
    receivedAt: performance.now()
  })
  const [displayPositionMs, setDisplayPositionMs] = useState(0)

  useEffect(() => {
    const durationMs = Math.max(0, input.durationMs)
    const positionMs = clampPosition(input.positionMs, durationMs)
    anchorRef.current = {
      durationMs,
      positionMs,
      playing: input.playing,
      receivedAt: performance.now()
    }
  }, [input.durationMs, input.playing, input.positionMs])

  useEffect(() => {
    let frame: number | null = null
    let timer: number | null = null
    let visible = !document.hidden
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let lastAccessibleUpdate = 0

    const positionAt = (now: number): number => {
      const anchor = anchorRef.current
      if (!anchor.playing || !visible) {
        return anchor.positionMs
      }
      return clampPosition(anchor.positionMs + now - anchor.receivedAt, anchor.durationMs)
    }
    const apply = (now: number, updateText: boolean): void => {
      const anchor = anchorRef.current
      const positionMs = positionAt(now)
      const progress = anchor.durationMs > 0 ? (positionMs / anchor.durationMs) * 100 : 0
      if (fillRef.current) {
        fillRef.current.style.width = `${progress}%`
      }
      if (progressBarRef.current) {
        progressBarRef.current.setAttribute('aria-valuenow', String(Math.round(positionMs)))
        progressBarRef.current.setAttribute(
          'aria-valuetext',
          `${formatPlaybackTime(positionMs)} of ${formatPlaybackTime(anchor.durationMs)}`
        )
      }
      if (updateText) {
        setDisplayPositionMs(positionMs)
      }
    }
    const stop = (): void => {
      if (frame !== null) {
        cancelAnimationFrame(frame)
        frame = null
      }
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    }
    const tick = (now: number): void => {
      if (!visible || !anchorRef.current.playing) {
        return
      }
      const updateText = now - lastAccessibleUpdate >= 250
      if (updateText) {
        lastAccessibleUpdate = now
      }
      apply(now, updateText)
      frame = requestAnimationFrame(tick)
    }
    const discreteTick = (): void => {
      if (!visible || !anchorRef.current.playing) {
        return
      }
      apply(performance.now(), true)
      timer = scheduleProgressTick(discreteTick)
    }
    const start = (): void => {
      stop()
      apply(performance.now(), true)
      if (!visible || !anchorRef.current.playing) {
        return
      }
      if (reducedMotion) {
        timer = scheduleProgressTick(discreteTick)
      } else {
        frame = requestAnimationFrame(tick)
      }
    }
    const onVisibilityChange = (): void => {
      visible = !document.hidden
      start()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    start()
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      stop()
    }
  }, [input.playing])

  const anchor = anchorRef.current
  const durationMs = anchor.durationMs
  const positionMs = clampPosition(displayPositionMs, durationMs)
  return {
    durationMs,
    fillRef,
    positionMs,
    progressBarRef,
    progressText: `${formatPlaybackTime(positionMs)} of ${formatPlaybackTime(durationMs)}`
  }
}
