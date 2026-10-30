import { describe, expect, it } from 'vitest'
import { SCENE_WINDOW_LINES, sceneRangeAt } from '@/lib/scene'

/** Offsets of the first occurrence of `quote` in `text`, as a [start, end) pair. */
function at(text: string, quote: string): [number, number] {
  const start = text.indexOf(quote)
  if (start === -1) throw new Error(`quote not found: ${quote}`)
  return [start, start + quote.length]
}

const SCENE_1 = '서윤은 문 앞에 섰다. 문은 잠겨 있었다.'
const SCENE_2 = '그녀는 열쇠를 꺼냈다. 손이 떨렸다.'
const SCENE_3 = '문이 열리고 바람이 불었다.'
const MARKED = `${SCENE_1}\n\n* * *\n\n${SCENE_2}\n\n* * *\n\n${SCENE_3}`

/** Text of the scene that holds the first occurrence of `quote`. */
function sceneTextAt(text: string, quote: string): string | undefined {
  const [start, end] = at(text, quote)
  const range = sceneRangeAt(text, start, end)
  return range ? text.slice(range.start, range.end) : undefined
}

describe('sceneRangeAt with scene break lines', () => {
  it('returns the trimmed scene 2 text for a quote inside it', () => {
    const [start, end] = at(MARKED, '열쇠를 꺼냈다')
    const range = sceneRangeAt(MARKED, start, end)
    expect(range).not.toBeNull()
    expect(MARKED.slice(range?.start, range?.end)).toBe(SCENE_2)
  })

  it('excludes the marker and the blank lines around it when there are extra blank lines', () => {
    const text = `${SCENE_1}\n\n\n* * *\n\n\n${SCENE_2}\n\n\n* * *\n\n\n${SCENE_3}\n`
    const [start, end] = at(text, '손이 떨렸다')
    const range = sceneRangeAt(text, start, end)
    expect(text.slice(range?.start, range?.end)).toBe(SCENE_2)
  })

  it('returns the first scene (before the first marker) for a quote in it', () => {
    const [start, end] = at(MARKED, '잠겨 있었다')
    const range = sceneRangeAt(MARKED, start, end)
    expect(MARKED.slice(range?.start, range?.end)).toBe(SCENE_1)
  })

  it('returns the last scene (after the last marker) for a quote in it', () => {
    const [start, end] = at(MARKED, '바람이 불었다')
    const range = sceneRangeAt(MARKED, start, end)
    expect(MARKED.slice(range?.start, range?.end)).toBe(SCENE_3)
  })

  it('returns null for a quote that spans two scenes', () => {
    const start = MARKED.indexOf('손이')
    const end = MARKED.indexOf('문이 열리고')
    expect(sceneRangeAt(MARKED, start, end)).toBeNull()
  })

  it('counts --- and ◇ lines as scene breaks', () => {
    const text = `${SCENE_1}\n---\n${SCENE_2}\n◇\n${SCENE_3}`
    expect(sceneTextAt(text, '손이 떨렸다')).toBe(SCENE_2)
    expect(sceneTextAt(text, '문이 열리고')).toBe(SCENE_3)
  })
})

describe('sceneRangeAt without scene break lines', () => {
  const lines = Array.from({ length: 20 }, (_, i) => `${i + 1}번째 문단이다.`)
  const text = lines.join('\n')

  it('uses a window of SCENE_WINDOW_LINES paragraphs on each side of the quote', () => {
    expect(SCENE_WINDOW_LINES).toBe(6)
    const [start, end] = at(text, '10번째 문단이다.')
    const range = sceneRangeAt(text, start, end)
    expect(text.slice(range?.start, range?.end)).toBe(lines.slice(3, 16).join('\n'))
  })

  it('clamps the window at the start of the text', () => {
    const [start, end] = at(text, '1번째 문단이다.')
    const range = sceneRangeAt(text, start, end)
    expect(range?.start).toBe(0)
    expect(text.slice(range?.start, range?.end)).toBe(lines.slice(0, 7).join('\n'))
  })

  it('clamps the window at the end of the text', () => {
    const [start, end] = at(text, '20번째 문단이다.')
    const range = sceneRangeAt(text, start, end)
    expect(range?.end).toBe(text.length)
  })
})

describe('sceneRangeAt edge cases', () => {
  it('returns null for empty text', () => {
    expect(sceneRangeAt('', 0, 1)).toBeNull()
    expect(sceneRangeAt('   \n  ', 0, 1)).toBeNull()
  })

  it('returns null for offsets outside the text or an empty quote', () => {
    expect(sceneRangeAt(MARKED, -1, 3)).toBeNull()
    expect(sceneRangeAt(MARKED, 0, MARKED.length + 1)).toBeNull()
    expect(sceneRangeAt(MARKED, 5, 5)).toBeNull()
    expect(sceneRangeAt(MARKED, 9, 3)).toBeNull()
  })
})
