import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS } from './status-bar-context-menu-policy'
import { useSpotifyPlayback } from './useSpotifyPlayback'
import { useSpotifyPlaybackProgress } from './useSpotifyPlaybackProgress'

export const SPOTIFY_BRAND_GREEN = '#1DB954'

function DecorativeWave({
  playing,
  audioLevel
}: {
  playing: boolean
  audioLevel: number | null
}): React.JSX.Element {
  const targetRef = useRef(0)
  const currentRef = useRef(0)
  const frameRef = useRef<number | null>(null)
  const barsRef = useRef<(HTMLSpanElement | null)[]>([])

  const applyAmplitude = useCallback(
    (amplitude: number): void => {
      const weights = [0.56, 0.92, 0.7, 1, 0.62]
      for (const [index, weight] of weights.entries()) {
        const bar = barsRef.current[index]
        if (bar) {
          bar.style.height = `${playing ? 3 + (2 + 9 * amplitude) * weight : 3}px`
        }
      }
    },
    [playing]
  )

  useEffect(() => {
    targetRef.current = playing ? Math.min(1, Math.max(0, audioLevel ?? 0)) : 0
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      currentRef.current = targetRef.current
      applyAmplitude(currentRef.current)
    }
  }, [applyAmplitude, audioLevel, playing])

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      currentRef.current = targetRef.current
      applyAmplitude(currentRef.current)
      return
    }
    const animate = (): void => {
      const target = targetRef.current
      const ratio = target > currentRef.current ? 0.34 : 0.1
      currentRef.current += (target - currentRef.current) * ratio
      applyAmplitude(currentRef.current)
      frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
      }
    }
  }, [applyAmplitude])

  return (
    <span aria-hidden="true" className="inline-flex h-3 items-end gap-px" data-spotify-wave>
      {[0.56, 0.92, 0.7, 1, 0.62].map((_, index) => (
        <span
          key={index}
          ref={(element) => {
            barsRef.current[index] = element
          }}
          style={{ width: 2, height: '3px', backgroundColor: SPOTIFY_BRAND_GREEN }}
        />
      ))}
    </span>
  )
}

function MenuControl(props: {
  label: string
  disabled: boolean
  onSelect: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <DropdownMenuItem
      aria-label={props.label}
      disabled={props.disabled}
      className="justify-center"
      onSelect={(event) => {
        event.preventDefault()
        props.onSelect()
      }}
    >
      {props.children}
      <span className="sr-only">{props.label}</span>
    </DropdownMenuItem>
  )
}

function Control(props: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={props.label}
          disabled={props.disabled}
          onClick={props.onClick}
          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          {props.children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{props.label}</TooltipContent>
    </Tooltip>
  )
}

export function SpotifyStatusSegment(_props: {
  compact: boolean
  iconOnly: boolean
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const { snapshot, pending, command, audioLevel } = useSpotifyPlayback(open)
  const item = snapshot.item
  const playing = snapshot.status === 'playing'
  const { durationMs, fillRef, positionMs, progressBarRef, progressText } =
    useSpotifyPlaybackProgress({
      durationMs: item?.durationMs ?? 0,
      positionMs: item?.positionMs ?? 0,
      playing
    })
  if ((snapshot.status !== 'playing' && snapshot.status !== 'paused') || !item) {
    return null
  }
  const previousLabel = translate('spotifyPlayback.previous', 'Previous')
  const toggleLabel = playing
    ? translate('spotifyPlayback.pause', 'Pause')
    : translate('spotifyPlayback.play', 'Play')
  const nextLabel = translate('spotifyPlayback.next', 'Next')
  const previousDisabled = pending || !snapshot.capabilities.previous
  const toggleDisabled = pending || !snapshot.capabilities.togglePlayPause
  const nextDisabled = pending || !snapshot.capabilities.next

  return (
    <div
      className="inline-flex shrink-0 items-center gap-1"
      role="group"
      aria-label={translate('spotifyPlayback.group', 'Spotify playback')}
    >
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex shrink-0 items-center rounded px-1 py-0.5 hover:bg-accent"
            aria-label={translate('spotifyPlayback.open', 'Open Spotify player')}
          >
            <DecorativeWave playing={playing} audioLevel={audioLevel} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          {...STATUS_BAR_CONTEXT_MENU_EXEMPT_PROPS}
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={8}
          className="w-[min(320px,calc(100vw-16px))] p-3"
        >
          <DropdownMenuLabel className="p-0 font-normal">
            <span className="text-xs font-semibold" style={{ color: SPOTIFY_BRAND_GREEN }}>
              {translate('spotifyPlayback.brand', 'Spotify')}
            </span>
            <span className="mt-2 flex gap-3">
              {item.artworkDataUrl ? (
                <img
                  src={item.artworkDataUrl}
                  alt=""
                  className="size-16 shrink-0 rounded object-cover"
                />
              ) : null}
              <span className="min-w-0 self-center">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {item.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.artists.join(', ')}
                </span>
                {item.album ? (
                  <span className="block truncate text-xs text-muted-foreground/80">
                    {item.album}
                  </span>
                ) : null}
              </span>
            </span>
          </DropdownMenuLabel>
          <div
            className="mt-3 space-y-1"
            aria-label={translate('spotifyPlayback.progress', 'Playback progress')}
          >
            <div
              role="progressbar"
              ref={progressBarRef}
              aria-label={translate('spotifyPlayback.trackProgress', 'Track progress')}
              aria-valuemin={0}
              aria-valuemax={durationMs}
              aria-valuenow={positionMs}
              aria-valuetext={progressText}
              className="h-1 overflow-hidden rounded bg-muted"
            >
              <div
                ref={fillRef}
                className="h-full"
                style={{ backgroundColor: SPOTIFY_BRAND_GREEN }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{progressText.slice(0, progressText.indexOf(' of '))}</span>
              <span>{progressText.slice(progressText.indexOf(' of ') + 4)}</span>
            </div>
          </div>
          <DropdownMenuGroup
            className="mt-2 grid grid-cols-3 gap-2"
            aria-label={translate('spotifyPlayback.controls', 'Playback controls')}
          >
            <MenuControl
              label={previousLabel}
              disabled={previousDisabled}
              onSelect={() => void command('previous')}
            >
              <SkipBack className="size-4" />
            </MenuControl>
            <MenuControl
              label={toggleLabel}
              disabled={toggleDisabled}
              onSelect={() => void command('togglePlay')}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </MenuControl>
            <MenuControl
              label={nextLabel}
              disabled={nextDisabled}
              onSelect={() => void command('next')}
            >
              <SkipForward className="size-4" />
            </MenuControl>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="inline-flex shrink-0 items-center gap-1">
        <Control
          label={previousLabel}
          disabled={previousDisabled}
          onClick={() => void command('previous')}
        >
          <SkipBack className="size-3" />
        </Control>
        <Control
          label={toggleLabel}
          disabled={toggleDisabled}
          onClick={() => void command('togglePlay')}
        >
          {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
        </Control>
        <Control label={nextLabel} disabled={nextDisabled} onClick={() => void command('next')}>
          <SkipForward className="size-3" />
        </Control>
      </span>
    </div>
  )
}
