import { describe, expect, it } from 'vitest'
import { threadChapterCenter } from './thread-geometry'

describe('threadChapterCenter', () => {
  it.each([3, 6, 12, 24])('centers every marker across %i chapter cells', (chapters) => {
    for (const width of [304.5, 681.25, 1080]) {
      const cell = width / chapters
      for (let chapter = 1; chapter <= chapters; chapter++) {
        const center = threadChapterCenter(chapter, chapters, width)
        expect(center - (chapter - 1) * cell).toBeCloseTo(cell / 2)
        expect(chapter * cell - center).toBeCloseTo(cell / 2)
      }
    }
  })
})
