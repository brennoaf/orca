// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const editorProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }))
const storeState = vi.hoisted(() => ({
  current: {
    theme: 'dark',
    terminalFontSize: 13,
    terminalFontFamily: 'D2Coding Nerd Font Mono',
    editorFontFamily: ''
  } as Record<string, unknown>
}))

vi.mock('@monaco-editor/react', () => ({
  default: (props: Record<string, unknown>) => {
    editorProps.current = props
    return null
  },
  loader: { config: vi.fn() }
}))
vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      settings: storeState.current,
      editorFontZoomLevel: 0,
      setPendingEditorReveal: vi.fn(),
      setEditorCursorLine: vi.fn(),
      addDiffComment: vi.fn(),
      deleteDiffComment: vi.fn(),
      updateDiffComment: vi.fn(),
      scrollToDiffCommentId: null,
      setScrollToDiffCommentId: vi.fn(),
      worktreeDiffComments: {}
    })
}))
vi.mock('../diff-comments/useDiffCommentDecorator', () => ({
  useDiffCommentDecorator: vi.fn()
}))
vi.mock('./useContextualCopySetup', () => ({
  useContextualCopySetup: () => ({ setupCopy: vi.fn(), toastNode: null })
}))

import MonacoEditor from './MonacoEditor'

function renderEditor(): ReturnType<typeof render> {
  return render(
    <MonacoEditor
      fileId="file"
      filePath="/repo/file.py"
      viewStateKey="pane:file"
      relativePath="file.py"
      content="# 한글 주석"
      language="python"
      onContentChange={vi.fn()}
      onSave={vi.fn()}
      readOnly
    />
  )
}

afterEach(() => {
  cleanup()
  editorProps.current = null
})

describe('MonacoEditor font family', () => {
  it('keeps the built-in Monaco theme when the interface theme is default', () => {
    storeState.current = {
      theme: 'light',
      interfaceTheme: 'default',
      terminalFontSize: 13,
      terminalFontFamily: 'D2Coding Nerd Font Mono',
      editorFontFamily: ''
    }
    renderEditor()

    expect(editorProps.current?.theme).toBe('vs')
  })

  it('follows the terminal font when no editor font override is set', () => {
    storeState.current = {
      theme: 'dark',
      interfaceTheme: 'miku',
      terminalFontSize: 13,
      terminalFontFamily: 'D2Coding Nerd Font Mono',
      editorFontFamily: ''
    }
    renderEditor()
    const options = editorProps.current?.options as Record<string, unknown> | undefined
    expect(options?.fontFamily).toBe('D2Coding Nerd Font Mono')
    expect(editorProps.current?.theme).toBe('orca-miku-dark')
  })

  it('uses the opt-in editor font override instead of the terminal font', () => {
    storeState.current = {
      theme: 'dark',
      interfaceTheme: 'xp',
      terminalFontSize: 13,
      terminalFontFamily: 'D2Coding Nerd Font Mono',
      editorFontFamily: 'D2Coding Nerd Font'
    }
    renderEditor()
    const options = editorProps.current?.options as Record<string, unknown> | undefined
    expect(options?.fontFamily).toBe('D2Coding Nerd Font')
    expect(editorProps.current?.theme).toBe('orca-xp-dark')
  })

  it('updates the interface theme without remounting the application', () => {
    storeState.current = {
      theme: 'light',
      interfaceTheme: 'qq98',
      terminalFontSize: 13,
      terminalFontFamily: 'D2Coding Nerd Font Mono',
      editorFontFamily: ''
    }
    const view = renderEditor()

    expect(editorProps.current?.theme).toBe('orca-qq98-light')

    storeState.current = { ...storeState.current, interfaceTheme: 'minecraft' }
    view.rerender(
      <MonacoEditor
        fileId="file"
        filePath="/repo/file.py"
        viewStateKey="pane:file"
        relativePath="file.py"
        content="# 한글 주석"
        language="python"
        onContentChange={vi.fn()}
        onSave={vi.fn()}
        readOnly
      />
    )

    expect(editorProps.current?.theme).toBe('orca-minecraft-light')
  })
})
