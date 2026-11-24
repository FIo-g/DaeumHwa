import { describe, expect, it } from 'vitest'
import { ENTRY_KINDS } from '@/db/types'
import { ENTRY_KIND_MARK, GRAPH_INK, RELATION_INK } from './graph-style'

describe('ENTRY_KIND_MARK', () => {
  it('tells every card kind apart by shape and fill, without hue', () => {
    const looks = ENTRY_KINDS.map((kind) => {
      const mark = ENTRY_KIND_MARK[kind]
      return `${mark.shape}:${mark.filled ? 'filled' : 'outlined'}`
    })
    expect(new Set(looks).size).toBe(ENTRY_KINDS.length)
  })

  it('draws cards and relations in graphite inks only, never in proof red or blue pencil', () => {
    const neutral: string[] = [GRAPH_INK.graphite, GRAPH_INK.muted, GRAPH_INK.pencil]
    for (const kind of ENTRY_KINDS) expect(neutral).toContain(ENTRY_KIND_MARK[kind].ink)
    expect(neutral).toContain(RELATION_INK)
  })
})
