import { Check } from 'lucide-react'
import type { KeyboardEvent, ReactElement } from 'react'

import type { GlobalSettings } from '../../../../shared/types'
import type { InterfaceTheme } from '../../../../shared/interface-theme'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { InterfaceThemeThumbnail } from './InterfaceThemeThumbnail'
import { interfaceThemePreviewEntries } from './interface-theme-preview'

type InterfaceThemeSectionProps = {
  value: GlobalSettings['interfaceTheme']
  onChange: (theme: InterfaceTheme) => void
}

function getNextTheme(theme: InterfaceTheme, direction: 1 | -1): InterfaceTheme {
  const index = interfaceThemePreviewEntries.findIndex((entry) => entry.theme === theme)
  return interfaceThemePreviewEntries[
    (index + direction + interfaceThemePreviewEntries.length) % interfaceThemePreviewEntries.length
  ].theme
}

export function InterfaceThemeSection({
  value = 'default',
  onChange
}: InterfaceThemeSectionProps): ReactElement {
  const title = translate('settings.appearance.interfaceTheme.title', 'Interface Theme')

  function selectFromKey(event: KeyboardEvent<HTMLButtonElement>, theme: InterfaceTheme): void {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      onChange(theme)
      return
    }
    const isForward = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    const isBackward = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    if (!isForward && !isBackward && event.key !== 'Home' && event.key !== 'End') {
      return
    }
    event.preventDefault()
    const nextTheme =
      event.key === 'Home'
        ? interfaceThemePreviewEntries[0].theme
        : event.key === 'End'
          ? (interfaceThemePreviewEntries.at(-1)?.theme ?? theme)
          : getNextTheme(theme, isForward ? 1 : -1)
    onChange(nextTheme)
    event.currentTarget
      .closest('[role="radiogroup"]')
      ?.querySelector<HTMLButtonElement>(`[data-interface-theme="${nextTheme}"]`)
      ?.focus()
  }

  return (
    <section aria-labelledby="interface-theme-heading" className="py-4">
      <div className="mb-3 space-y-0.5">
        <h3 id="interface-theme-heading" className="text-sm font-medium text-foreground">
          {title}
        </h3>
        <p className="text-xs text-muted-foreground">
          {translate(
            'settings.appearance.interfaceTheme.description',
            'Choose a visual style for Orca. Every style adapts to light and dark mode.'
          )}
        </p>
      </div>
      <div
        role="radiogroup"
        aria-labelledby="interface-theme-heading"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4"
      >
        {interfaceThemePreviewEntries.map(({ theme, name, description }) => {
          const selected = value === theme
          const nameId = `interface-theme-${theme}-name`
          const descriptionId = `interface-theme-${theme}-description`
          return (
            <button
              key={theme}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-labelledby={nameId}
              aria-describedby={descriptionId}
              data-interface-theme={theme}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(theme)}
              onKeyDown={(event) => selectFromKey(event, theme)}
              className={cn(
                'group relative min-w-0 rounded-lg border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                selected
                  ? 'border-ring bg-accent/45'
                  : 'border-border bg-card/35 hover:bg-accent/30'
              )}
            >
              <span
                aria-hidden="true"
                data-interface-theme-preview
                className="block aspect-[16/9] overflow-hidden rounded-md border border-border/70"
              >
                <InterfaceThemeThumbnail theme={theme} />
              </span>
              <span className="mt-1.5 flex min-w-0 items-center gap-1.5">
                <span
                  id={nameId}
                  className="min-w-0 flex-1 truncate text-xs font-medium text-foreground"
                >
                  {name}
                </span>
                {selected ? (
                  <span
                    aria-hidden="true"
                    data-interface-theme-check
                    className="grid size-4 shrink-0 place-items-center rounded-full bg-accent text-foreground"
                  >
                    <Check className="size-3" />
                  </span>
                ) : null}
              </span>
              <span id={descriptionId} className="block truncate text-[11px] text-muted-foreground">
                {description}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
