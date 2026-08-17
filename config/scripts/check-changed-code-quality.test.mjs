import { describe, expect, it, vi } from 'vitest'
import {
  OXLINT_SCANS,
  chunkOxlintFiles,
  diagnosticTouchesAddedLines,
  isLintableSourceFile,
  overlapsAddedLines,
  parseAddedLineRanges,
  runOxlintScan
} from './check-changed-code-quality.mjs'

describe('changed-code quality line matching', () => {
  it('parses added and replaced hunk ranges while ignoring deletions', () => {
    const ranges = parseAddedLineRanges(
      ['@@ -10,2 +10,3 @@', '@@ -20 +21 @@', '@@ -40,4 +42,0 @@', '@@ -50 +48,2 @@'].join('\n')
    )

    expect(ranges).toEqual([
      { start: 10, end: 12 },
      { start: 21, end: 21 },
      { start: 48, end: 49 }
    ])
  })

  it('matches diagnostics that overlap any added line', () => {
    const ranges = [
      { start: 5, end: 7 },
      { start: 12, end: 12 }
    ]

    expect(overlapsAddedLines(3, 5, ranges)).toBe(true)
    expect(overlapsAddedLines(8, 11, ranges)).toBe(false)
    expect(overlapsAddedLines(12, 14, ranges)).toBe(true)
  })

  it('normalizes absolute diagnostic paths before matching', () => {
    const root = process.cwd()
    const file = 'config/scripts/check-changed-code-quality.test.mjs'
    const diagnostic = {
      filename: `${root}/${file}`,
      labels: [{ span: { line: 24 } }]
    }

    expect(
      diagnosticTouchesAddedLines(diagnostic, new Map([[file, [{ start: 24, end: 24 }]]]), root)
    ).toBe(true)
  })

  // Why: pinning --config disables nested-config discovery, so root rules that
  // mobile/.oxlintrc.json turns off would fail the gate on mobile files.
  it('lets the untyped scan discover nested configs instead of pinning the root config', () => {
    const scan = OXLINT_SCANS.find((candidate) => candidate.label === 'code quality')

    expect(scan.args).not.toContain('--config')
    expect(scan.args).not.toContain('--disable-nested-config')
  })

  it('chunks large Windows scans while keeping POSIX scans intact', () => {
    const files = Array.from({ length: 101 }, (_, index) => `src/file-${index}.ts`)

    expect(chunkOxlintFiles(files, 'win32')).toEqual([
      files.slice(0, 20),
      files.slice(20, 40),
      files.slice(40, 60),
      files.slice(60, 80),
      files.slice(80, 100),
      files.slice(100)
    ])
    expect(chunkOxlintFiles(files, 'linux')).toEqual([files])
  })

  it('excludes backups and generated native output with Windows path separators', () => {
    expect(isLintableSourceFile('src/main/spotify-playback.ts')).toBe(true)
    expect(isLintableSourceFile('src\\main\\spotify-playback.ts')).toBe(true)
    expect(isLintableSourceFile('.codex-backups/quality/file.ts')).toBe(false)
    expect(isLintableSourceFile('scratchpad\\snapshot\\file.tsx')).toBe(false)
    expect(isLintableSourceFile('NUL')).toBe(false)
    expect(isLintableSourceFile('native/windows-media-control/build/output.ts')).toBe(false)
  })

  it('stops after a failed Windows chunk', () => {
    const files = Array.from({ length: 51 }, (_, index) => `src/file-${index}.ts`)
    const failure = new Error('spawn failed')
    const spawn = vi
      .fn()
      .mockReturnValueOnce({ stdout: '{"diagnostics":[]}', stderr: '' })
      .mockReturnValueOnce({ error: failure, stdout: '', stderr: '' })

    expect(() =>
      runOxlintScan(process.cwd(), OXLINT_SCANS[0], files, { platform: 'win32', spawn })
    ).toThrow(failure)
    expect(spawn).toHaveBeenCalledTimes(2)
    expect(spawn.mock.calls[0][2]).toMatchObject({ shell: true })
  })
})
