import { describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import {
  applyCompactSlackAdapter,
  buildCompactSlackScript,
  compactSlackCss,
  detectSlackContentMode,
  slackContentModeForUrl
} from './compact-dom-adapter'

function runCompactScript(window: Window, hydrationTimeoutMs = 5000): Promise<string> | string {
  return new Function(
    'window',
    'document',
    'MutationObserver',
    `return ${buildCompactSlackScript(hydrationTimeoutMs)}`
  )(window, window.document, window.MutationObserver) as Promise<string> | string
}

describe('Slack content detection', () => {
  it('classifies login and auth routes without DOM guesses', () => {
    expect(slackContentModeForUrl('https://app.slack.com/signin')).toBe('login')
    expect(slackContentModeForUrl('https://accounts.google.com/o/oauth2/auth')).toBe('login')
  })

  it('classifies authenticated client as compact only after the adapter recognizes its structure', async () => {
    const webContents = {
      getURL: () => 'https://app.slack.com/client/T/C',
      executeJavaScriptInIsolatedWorld: vi.fn().mockResolvedValue('conversation'),
      insertCSS: vi.fn().mockResolvedValue('css-key'),
      removeInsertedCSS: vi.fn().mockResolvedValue(undefined)
    }
    await expect(detectSlackContentMode(webContents, null)).resolves.toBe('compact')
    expect(webContents.insertCSS).toHaveBeenCalledOnce()
  })

  it('cleans up CSS when the authenticated structure is not supported', async () => {
    const webContents = {
      executeJavaScriptInIsolatedWorld: vi
        .fn()
        .mockResolvedValueOnce('unsupported')
        .mockResolvedValueOnce(undefined),
      insertCSS: vi.fn().mockResolvedValue('css-key'),
      removeInsertedCSS: vi.fn().mockResolvedValue(undefined)
    }
    await expect(applyCompactSlackAdapter(webContents, null)).resolves.toBeNull()
    expect(webContents.removeInsertedCSS).toHaveBeenCalledWith('css-key')
    expect(webContents.executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(2)
  })

  it('does not move an existing Back button after a subsequent mutation', async () => {
    const window = new Window()
    const { document } = window
    document.body.innerHTML =
      '<div class="p-ia4_client"><div class="p-view_contents--sidebar"><div role="tree" data-qa="slack_kit_list"></div></div><div class="p-view_contents--primary"><div data-qa="view_header"><span>Title</span><button data-qa="avatar_stack"><span>12</span></button></div><div role="textbox" data-qa="texty_input"></div></div></div>'
    const members = document.querySelector('[data-qa="avatar_stack"]')
    await runCompactScript(window)
    const header = document.querySelector('[data-qa="view_header"]')
    if (!header) {
      throw new Error('header missing')
    }
    const mutations = vi.fn()
    const observer = new window.MutationObserver(mutations)
    observer.observe(header, { childList: true })
    document.body.append(document.createElement('div'))
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    expect(mutations).not.toHaveBeenCalled()
    expect(header.firstElementChild?.id).toBe('orca-slack-fast-response-back')
    expect(header.firstElementChild?.getAttribute('aria-label')).toBe('Back to conversations')
    expect(header.firstElementChild?.getAttribute('title')).toBe('Back to conversations')
    expect(header.firstElementChild?.querySelector('svg')?.getAttribute('viewBox')).toBe(
      '0 0 24 24'
    )
    expect(header.firstElementChild?.textContent).toBe('')
    expect(document.querySelector('[data-qa="avatar_stack"]')).toBe(members)
    expect(members?.textContent).toBe('12')
    window.close()
  })

  it('scopes compact list spacing and conversation controls to the adapter mode', () => {
    expect(compactSlackCss).toContain(
      'html[data-orca-slack-fast-response="1"] .p-ia4_top_nav,html[data-orca-slack-fast-response="1"] .p-ia4_top_nav__container_wrapper'
    )
    expect(compactSlackCss).toContain(
      'html[data-orca-slack-fast-response="1"] .p-client_workspace{padding:0!important}'
    )
    expect(compactSlackCss).toContain(
      'html[data-orca-slack-fast-response="1"] .p-client_workspace__tabpanel{grid-template-columns:minmax(0,1fr)!important;border:0!important}'
    )
    expect(compactSlackCss).toContain(
      'html[data-orca-slack-fast-response="1"] .p-view_contents{max-height:none!important}'
    )
    expect(compactSlackCss).toContain('[data-orca-slack-mode="list"] .p-ia4_sidebar_header')
    expect(compactSlackCss).toContain(
      '[data-orca-slack-mode="list"] [data-qa="sidebar-text-filter-input"]'
    )
    expect(compactSlackCss).toContain(
      '[data-orca-slack-mode="conversation"] [data-qa="view_header"] [data-qa="entity-header-star-button"]'
    )
    expect(compactSlackCss).toContain(
      '[data-orca-slack-mode="conversation"] [data-qa="view_header"] [data-qa="huddle_channel_header_button"]'
    )
    expect(compactSlackCss).toContain(
      '[data-orca-slack-mode="conversation"] [data-qa="view_header"] [data-qa="avatar_stack"]{height:28px!important;flex:0 0 auto!important;padding:2px 6px!important}'
    )
    expect(compactSlackCss).not.toMatch(
      /\[data-qa="avatar_stack"\][^{]*\{[^}]*\b(?:width|max-width):/
    )
    expect(compactSlackCss).toContain(
      '[data-orca-slack-mode="conversation"] [data-qa="view_header"] [data-qa="unstyled-button"]:has([data-qa="ellipsis-vertical-filled"])'
    )
  })

  it('keeps the adapter after late Slack hydration settles', async () => {
    vi.useFakeTimers()
    try {
      const window = new Window()
      const { document } = window
      document.body.innerHTML =
        '<div class="p-ia4_client"><div class="p-view_contents--sidebar"></div><div class="p-view_contents--primary"><div role="textbox" data-qa="texty_input"></div></div></div>'
      const applied = runCompactScript(window)
      let settled = false
      const completion = Promise.resolve(applied).then((mode) => {
        settled = true
        return mode
      })
      vi.advanceTimersByTime(5001)
      await Promise.resolve()
      expect(settled).toBe(false)
      document
        .querySelector('.p-view_contents--primary')
        ?.prepend(
          document.createRange().createContextualFragment('<div data-qa="view_header"></div>')
        )
      await expect(completion).resolves.toBe('conversation')
      vi.advanceTimersByTime(20001)
      expect(document.documentElement.getAttribute('data-orca-slack-fast-response')).toBe('1')
      window.close()
    } finally {
      vi.useRealTimers()
    }
  })

  it('releases the manual list only after the conversation route changes', async () => {
    const window = new Window({ url: 'https://app.slack.com/client/T/C' })
    const { document } = window
    document.body.innerHTML =
      '<div class="p-ia4_client"><div class="p-channel_sidebar"><button>Filter</button><div tabindex="0">Section</div></div><div class="p-workspace__primary_view"><div data-qa="view_header"></div><div role="textbox" data-qa="texty_input"></div></div></div>'
    await expect(Promise.resolve(runCompactScript(window))).resolves.toBe('conversation')
    const back = document.getElementById('orca-slack-fast-response-back')
    back?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    expect(document.documentElement.getAttribute('data-orca-slack-mode')).toBe('list')
    document
      .querySelector('.p-channel_sidebar button')
      ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    document
      .querySelector('.p-channel_sidebar div')
      ?.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
    expect(document.documentElement.getAttribute('data-orca-slack-mode')).toBe('list')
    window.history.pushState(null, '', '/client/T/NEXT')
    document.querySelector('.p-workspace__primary_view')?.setAttribute('data-qa', 'next-primary')
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    expect(document.documentElement.getAttribute('data-orca-slack-mode')).toBe('conversation')
    window.close()
  })

  it('cleans up an unsupported document after the hydration timeout', async () => {
    const window = new Window()
    const { document } = window
    await expect(Promise.resolve(runCompactScript(window, 0))).resolves.toBe('unsupported')
    document.body.innerHTML =
      '<div class="p-ia4_client"><div class="p-view_contents--sidebar"><div role="tree" data-qa="slack_kit_list"></div></div><div class="p-view_contents--primary"><div data-qa="view_header"></div><div role="textbox" data-qa="texty_input"></div></div></div>'
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    expect(document.documentElement.getAttribute('data-orca-slack-fast-response')).toBeNull()
    window.close()
  })

  it('cancels a pending hydration when cleanup runs', async () => {
    const window = new Window()
    const applied = runCompactScript(window)
    const cleanup = (window as unknown as { __orcaSlackFastResponseCleanup?: () => void })
      .__orcaSlackFastResponseCleanup
    cleanup?.()
    await expect(Promise.resolve(applied)).resolves.toBe('unsupported')
    window.close()
  })
})
