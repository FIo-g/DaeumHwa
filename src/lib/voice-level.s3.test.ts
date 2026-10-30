import { describe, expect, it } from 'vitest'
import { quotedLines, voiceLevelOf } from '@/lib/voice-level'

describe('voiceLevelOf (stage 3 task 8)', () => {
  it.each([
    ['반말을 쓰며 짧고 직설적이다.', 'banmal'],
    ['처음 만나는 어른에게도 존댓말 없이 반말을 쓰며', 'banmal'],
    ['세린에게도 존댓말을 쓰며', 'jondaet'],
    ['공손한 존댓말 속에 비꼼이 섞이며', 'jondaet'],
    ['짧고 단정한 문장을 쓴다.', null],
    ['존댓말을 쓰다가 화나면 반말을 한다', null],
  ] as const)('reads %s as %s', (speech, level) => {
    expect(voiceLevelOf(speech)).toBe(level)
  })
})

describe('quotedLines (stage 3 task 8)', () => {
  it('finds the quoted lines of a text', () => {
    const text = '세린이 말했다. "빨래 가져왔어요."\n민준이 물었다. "누구세요."'
    const lines = quotedLines(text)
    expect(lines.map((line) => line.quote)).toEqual(['"빨래 가져왔어요."', '"누구세요."'])
    expect(lines.map((line) => line.id)).toEqual([1, 2])
    expect(lines[0].start).toBe(text.indexOf('"빨래 가져왔어요."'))
    expect(lines[0].end).toBe(lines[0].start + '"빨래 가져왔어요."'.length)
    expect(lines.every((line) => line.level === 'jondaet')).toBe(true)
  })
})
