import { describe, expect, it } from 'vitest'
import { isWithinWorkspace, validateWorkspaceBasename, validateWorkspaceRelativePath } from '../../src/main/workspace/workspace-path'

describe('workspace path validation', () => {
  it('normalizes safe relative paths', () => {
    expect(validateWorkspaceRelativePath('docs\\guide.md')).toBe('docs/guide.md')
    expect(validateWorkspaceRelativePath('./docs/guide.md')).toBe('docs/guide.md')
    expect(validateWorkspaceRelativePath('')).toBe('')
  })

  it('rejects traversal, absolute, UNC, drive, and device paths', () => {
    for (const value of ['../secret.md', 'docs/../../secret.md', '/etc/passwd', 'C:\\secret.md', '\\\\server\\share\\file.md', '\\\\?\\C:\\secret.md']) {
      expect(() => validateWorkspaceRelativePath(value)).toThrow()
    }
  })

  it('validates entry basenames', () => {
    expect(validateWorkspaceBasename('guide.md')).toBe('guide.md')
    expect(() => validateWorkspaceBasename('../guide.md')).toThrow()
    expect(() => validateWorkspaceBasename('folder/guide.md')).toThrow()
  })

  it('checks containment without prefix confusion', () => {
    expect(isWithinWorkspace('/work/docs', '/work/docs/guide.md')).toBe(true)
    expect(isWithinWorkspace('/work/docs', '/work/docs-other/guide.md')).toBe(false)
  })
})
