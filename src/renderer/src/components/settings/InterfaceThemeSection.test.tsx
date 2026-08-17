import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { InterfaceThemeSection } from './InterfaceThemeSection'
import { getInterfaceThemeEntries } from './appearance-search'
import { matchesSettingsSearch } from './settings-search'

function findThemeButton(
  node: ReactNode,
  theme: string
): ReactElement<{ onClick: () => void; onKeyDown: (event: KeyboardEvent) => void }> | null {
  if (!isValidElement<Record<string, unknown>>(node)) {
    return null
  }
  if (node.props['data-interface-theme'] === theme) {
    return node as ReactElement<{ onClick: () => void; onKeyDown: (event: KeyboardEvent) => void }>
  }
  for (const child of Children.toArray(node.props.children as ReactNode)) {
    const button = findThemeButton(child, theme)
    if (button) {
      return button
    }
  }
  return null
}

describe('InterfaceThemeSection', () => {
  it('renders all interface themes as accessible cards', () => {
    const markup = renderToStaticMarkup(
      <InterfaceThemeSection value="default" onChange={vi.fn()} />
    )

    expect(markup).toContain('role="radiogroup"')
    expect(markup.match(/role="radio"/g)).toHaveLength(10)
    expect(markup).toContain('data-interface-theme="default"')
    expect(markup).toContain('aria-checked="true"')
    expect(markup).toContain('aria-labelledby="interface-theme-default-name"')
    expect(markup).toContain('aria-describedby="interface-theme-default-description"')
    expect(markup).toContain('Blue Fantasy')
    expect(markup).toContain('Whale Song')
    expect(markup).toContain('data-thumbnail-theme="minecraft"')
  })

  it('renders the selected indicator after the thumbnail preview', () => {
    const markup = renderToStaticMarkup(<InterfaceThemeSection value="xp" onChange={vi.fn()} />)
    const xpCardStart = markup.indexOf('data-interface-theme="xp"')
    const previewStart = markup.indexOf('data-interface-theme-preview', xpCardStart)
    const checkStart = markup.indexOf('data-interface-theme-check', xpCardStart)

    expect(previewStart).toBeGreaterThan(xpCardStart)
    expect(checkStart).toBeGreaterThan(previewStart)
  })

  it('selects a card and supports arrow-key navigation', () => {
    const onChange = vi.fn()
    const section = InterfaceThemeSection({ value: 'default', onChange })
    const defaultCard = findThemeButton(section, 'default')
    const miku = findThemeButton(section, 'miku')
    const focus = vi.fn()
    const querySelector = vi.fn(() => ({ focus }))
    const currentTarget = { closest: () => ({ querySelector }) }

    miku?.props.onClick()
    defaultCard?.props.onKeyDown({
      key: 'ArrowRight',
      preventDefault: vi.fn(),
      currentTarget
    } as unknown as KeyboardEvent)

    expect(onChange).toHaveBeenNthCalledWith(1, 'miku')
    expect(onChange).toHaveBeenNthCalledWith(2, 'blue-fantasy')
    expect(querySelector).toHaveBeenCalledWith('[data-interface-theme="blue-fantasy"]')
    expect(focus).toHaveBeenCalledOnce()
  })

  it('supports Home and End navigation inside the radiogroup', () => {
    const onChange = vi.fn()
    const section = InterfaceThemeSection({ value: 'miku', onChange })
    const miku = findThemeButton(section, 'miku')
    const currentTarget = {
      closest: () => ({ querySelector: () => ({ focus: vi.fn() }) })
    }

    miku?.props.onKeyDown({
      key: 'Home',
      preventDefault: vi.fn(),
      currentTarget
    } as unknown as KeyboardEvent)
    miku?.props.onKeyDown({
      key: 'End',
      preventDefault: vi.fn(),
      currentTarget
    } as unknown as KeyboardEvent)

    expect(onChange).toHaveBeenNthCalledWith(1, 'default')
    expect(onChange).toHaveBeenNthCalledWith(2, 'xp')
  })

  it('indexes theme names for settings search', () => {
    const entry = getInterfaceThemeEntries()[0]

    expect(matchesSettingsSearch('whale song', entry)).toBe(true)
    expect(matchesSettingsSearch('minecraft', entry)).toBe(true)
  })
})
