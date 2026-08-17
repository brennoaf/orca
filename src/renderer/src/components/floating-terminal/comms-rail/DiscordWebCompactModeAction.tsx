import { useEffect, useState, type CSSProperties } from 'react'
import { PanelsTopLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { DiscordWebCompactMode } from '../../../../../shared/discord-web-fast-response'
import type { DiscordWebFastResponseHostState } from './use-discord-web-fast-response-host'

type DiscordCompactModeState = 'installed' | 'navigating' | 'unsupported'

const NO_DRAG = { WebkitAppRegion: 'no-drag' } as CSSProperties

export function DiscordWebCompactModeAction({
  state
}: {
  state: DiscordWebFastResponseHostState
}): React.JSX.Element | null {
  const available = state.kind === 'ready' && state.contentMode === 'ready'
  const [mode, setMode] = useState<DiscordWebCompactMode | null>(null)
  const [canClose, setCanClose] = useState(false)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!available) {
      setMode(null)
      setCanClose(false)
      setPending(false)
      setFailed(false)
      return
    }
    let disposed = false
    let receivedModeEvent = false
    const removeModeListener = window.api.discordWebFastResponse.onCompactModeChanged((next) => {
      receivedModeEvent = true
      setMode(next.mode)
      setCanClose(next.canClose)
      setPending(false)
      setFailed(false)
    })
    void callRuntimeRpc<{ mode: DiscordWebCompactMode; canClose: boolean }>(
      { kind: 'local' },
      'discordWebFastResponse.getCompactMode'
    )
      .then((result) => {
        if (!disposed && !receivedModeEvent) {
          setMode(result.mode)
          setCanClose(result.canClose)
          setPending(false)
          setFailed(false)
        }
      })
      .catch(() => {
        if (!disposed) {
          setPending(false)
          setFailed(true)
        }
      })
    return () => {
      disposed = true
      removeModeListener()
    }
  }, [available, state])

  if (!available) {
    return null
  }
  const label =
    mode?.kind === 'manager'
      ? canClose
        ? translate('communicationRail.discord.closeManager', 'Return to Discord')
        : translate('communicationRail.discord.managerNoReturn', 'Discord hub has no previous view')
      : translate('communicationRail.discord.openManager', 'Open Discord manager')
  const failureLabel = translate(
    'communicationRail.discord.compactModeFailed',
    'Could not change the Discord view.'
  )
  const tooltip = failed ? failureLabel : label
  const toggleHub = (): void => {
    if (pending || mode === null) {
      return
    }
    setPending(true)
    setFailed(false)
    void callRuntimeRpc<{
      mode: DiscordWebCompactMode
      canClose: boolean
      state: DiscordCompactModeState
    }>({ kind: 'local' }, 'discordWebFastResponse.toggleCompactHub')
      .then((result) => {
        setMode(result.mode)
        setCanClose(result.canClose)
        setFailed(result.state === 'unsupported')
        if (result.state !== 'navigating') {
          setPending(false)
        }
      })
      .catch(() => {
        setPending(false)
        setFailed(true)
      })
  }
  return (
    <div className="flex shrink-0 items-center" data-no-drag style={NO_DRAG}>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={tooltip}
        aria-pressed={mode?.kind === 'manager'}
        disabled={pending || mode === null || (mode.kind === 'manager' && !canClose)}
        onClick={toggleHub}
      >
        <PanelsTopLeft />
      </Button>
    </div>
  )
}
