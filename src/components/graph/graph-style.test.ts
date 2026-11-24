import { describe, expect, it } from 'vitest'
import { ENTRY_KINDS } from '@/db/types'
import { ENTRY_KIND_MARK, GRAPH_COLOR_TOKENS } from './graph-style'

describe('ENTRY_KIND_MARK', () => {
  it('tells every card kind apart by shape and fill, without hue', () => {
    const looks = ENTRY_KINDS.map((kind) => {
      const mark = ENTRY_KIND_MARK[kind]
      return `${mark.shape}:${mark.filled ? 'filled' : 'outlined'}`
    })
    expect(new Set(looks).size).toBe(ENTRY_KINDS.length)
  })

  it('uses only neutral tokens for card marks', () => {
    for (const kind of ENTRY_KINDS) expect(['ink', 'muted']).toContain(ENTRY_KIND_MARK[kind].ink)
    expect(GRAPH_COLOR_TOKENS).toEqual({
      ink: '--b-ink',
      muted: '--b-muted',
      paper: '--b-paper',
      selection: '--b-mustard',
    })
  })
})
