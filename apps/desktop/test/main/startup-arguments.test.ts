import { describe, expect, it } from 'vitest'
import { parseStartupArguments } from '../../src/main/startup/startup-arguments'

describe('startup argument parser', () => {
  it('parses MarkHere switches without rebuilding shell command strings', () => {
    expect(parseStartupArguments(['--new-window', '--mode', 'source', 'C:\\Docs\\a b.md'])).toEqual({
      newWindow: true,
      mode: 'source',
      rawPaths: ['C:\\Docs\\a b.md']
    })
  })

  it('ignores unknown switches as data rather than interpreting them', () => {
    expect(parseStartupArguments(['--evil=$(calc)', 'README.md']).rawPaths).toEqual(['README.md'])
  })
})
