// @vitest-environment happy-dom

import { DndContext } from '@dnd-kit/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommunicationsDockLayoutNode } from '../../../../shared/communications-dock'
import { CommunicationsDockDivider } from './CommunicationsDockDivider'
import { CommunicationsDockSplitLayout } from './CommunicationsDockSplitLayout'

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => children
}))

const nestedLayout: CommunicationsDockLayoutNode = {
  type: 'split',
  direction: 'vertical',
  ratio: 0.6,
  first: {
    type: 'split',
    direction: 'horizontal',
    ratio: 0.5,
    first: { type: 'leaf', appId: 'whatsapp-web' },
    second: { type: 'leaf', appId: 'slack' }
  },
  second: { type: 'leaf', appId: 'discord' }
}

afterEach(cleanup)

describe('CommunicationsDockSplitLayout', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      }
    )
  })

  it('renders a nested three-leaf layout with both split orientations', () => {
    const { container } = render(
      <DndContext>
        <CommunicationsDockSplitLayout
          node={nestedLayout}
          tabId="all"
          activeLeafAppId="discord"
          setContentTarget={vi.fn()}
          onActivateLeaf={vi.fn()}
          onUpdateRatio={vi.fn()}
        />
      </DndContext>
    )
    expect(container.querySelectorAll('[data-communications-dock-leaf]')).toHaveLength(3)
    expect(screen.getAllByRole('separator')).toHaveLength(2)
    expect(container.querySelector('[style*="flex-direction: column"]')).toBeTruthy()
    expect(container.querySelector('[style*="flex-direction: row"]')).toBeTruthy()
  })

  it('supports keyboard divider changes with Orca ratio clamps', () => {
    const change = vi.fn()
    render(
      <div>
        <div />
        <CommunicationsDockDivider direction="horizontal" ratio={0.15} onRatioChange={change} />
        <div />
      </div>
    )
    const divider = screen.getByRole('separator')
    fireEvent.keyDown(divider, { key: 'ArrowLeft' })
    fireEvent.keyDown(divider, { key: 'End' })
    expect(change).toHaveBeenNthCalledWith(1, 0.15)
    expect(change).toHaveBeenNthCalledWith(2, 0.85)
  })
})
