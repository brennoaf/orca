// @vitest-environment happy-dom

import { DndContext } from '@dnd-kit/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommunicationsDockTab } from '../../../../shared/communications-dock'
import { CommunicationsDockNavbar } from './CommunicationsDockNavbar'

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => children
}))

const groupedTab: CommunicationsDockTab = {
  id: 'grouped',
  activeLeafAppId: 'slack',
  layout: {
    type: 'split',
    direction: 'horizontal',
    ratio: 0.5,
    first: { type: 'leaf', appId: 'whatsapp-web' },
    second: { type: 'leaf', appId: 'slack' }
  }
}

afterEach(cleanup)

describe('CommunicationsDockNavbar', () => {
  it('renders grouped app icons in DFS order and activates a segment', () => {
    const activateLeaf = vi.fn()
    render(
      <DndContext>
        <CommunicationsDockNavbar
          tabs={[groupedTab]}
          activeTabId="grouped"
          onActivateTab={vi.fn()}
          onActivateLeaf={activateLeaf}
        />
      </DndContext>
    )

    const tab = screen.getByRole('tab', { name: 'WhatsApp Web, Slack' })
    const segments = tab.querySelectorAll('[aria-label]')
    expect(Array.from(segments).map((segment) => segment.getAttribute('aria-label'))).toEqual([
      'WhatsApp Web',
      'Slack'
    ])
    fireEvent.click(screen.getByLabelText('WhatsApp Web'))
    expect(activateLeaf).toHaveBeenCalledWith('grouped', 'whatsapp-web')
  })

  it('moves roving focus across layout tabs without activating a collapsed body', () => {
    const second: CommunicationsDockTab = {
      id: 'discord',
      activeLeafAppId: 'discord',
      layout: { type: 'leaf', appId: 'discord' }
    }
    render(
      <DndContext>
        <CommunicationsDockNavbar
          tabs={[groupedTab, second]}
          activeTabId="grouped"
          onActivateTab={vi.fn()}
          onActivateLeaf={vi.fn()}
        />
      </DndContext>
    )
    const firstTab = screen.getByRole('tab', { name: 'WhatsApp Web, Slack' })
    firstTab.focus()
    fireEvent.keyDown(firstTab, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Discord' }))
  })
})
