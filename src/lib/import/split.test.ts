import { describe, expect, it } from 'vitest'
import { detectHeading, splitChapters } from '@/lib/import/split'

describe('detectHeading', () => {
  it.each([
    ['1화', '1화'],
    ['제1화', '제1화'],
    ['제 3 화', '제 3 화'],
    ['1화. 제목', '1화. 제목'],
    ['<프롤로그>', '<프롤로그>'],
    ['[6화]', '[6화]'],
    ['【7화】', '【7화】'],
    ['# 8화', '8화'],
    ['Episode 4', 'Episode 4'],
    ['EP.5', 'EP.5'],
    ['Chapter 2', 'Chapter 2'],
    ['에필로그', '에필로그'],
    ['외전', '외전'],
    ['번외', '번외'],
  ])('detects %s', (line, title) => {
    expect(detectHeading(line)).toBe(title)
  })

  it('does not treat prose that starts with a number and 화 as a heading', () => {
    expect(detectHeading('1화는 재미있었다')).toBeNull()
    expect(detectHeading('그는 웃었다.')).toBeNull()
  })

  it('does not treat a long line as a heading', () => {
    expect(detectHeading(`1화 ${'가'.repeat(50)}`)).toBeNull()
  })
})

describe('splitChapters', () => {
  it('splits on heading lines and keeps titles', () => {
    const r = splitChapters('1화\n가\n\n2화 - 만남\n나')
    expect(r.method).toBe('headings')
    expect(r.chapters.map((c) => c.title)).toEqual(['1화', '2화 - 만남'])
    expect(r.chapters.map((c) => c.body)).toEqual(['가', '나'])
  })

  it('keeps long preamble text as 머리말 and drops a short one', () => {
    const long = '가'.repeat(200)
    const withLong = splitChapters(`${long}\n1화\n본문`)
    expect(withLong.chapters[0].title).toBe('머리말')
    expect(withLong.chapters[1].title).toBe('1화')

    const withShort = splitChapters('짧은 머리말\n1화\n본문')
    expect(withShort.chapters.map((c) => c.title)).toEqual(['1화'])
  })

  it('splits on separator lines when there are no headings', () => {
    const r = splitChapters('첫 장면입니다.\n\n***\n\n둘째 장면입니다.\n\n---\n\n셋째 장면입니다.')
    expect(r.method).toBe('separators')
    expect(r.chapters.map((c) => c.body)).toEqual([
      '첫 장면입니다.',
      '둘째 장면입니다.',
      '셋째 장면입니다.',
    ])
  })

  it('falls back to size splitting at paragraph boundaries', () => {
    const paragraph = '가'.repeat(999)
    const text = Array.from({ length: 12 }, () => paragraph).join('\n')
    const r = splitChapters(text)
    expect(r.method).toBe('size')
    expect(r.chapters).toHaveLength(3)
    expect(r.chapters.map((c) => c.title)).toEqual(['1화', '2화', '3화'])
    expect(r.chapters.every((c) => c.body.split('\n').every((l) => l === paragraph))).toBe(true)
  })

  it('returns a single chapter for short text without headings', () => {
    const r = splitChapters('짧은 원고입니다.')
    expect(r.method).toBe('single')
    expect(r.chapters).toEqual([{ title: '1화', body: '짧은 원고입니다.', startLine: 0 }])
  })

  it('returns no chapters for empty text', () => {
    expect(splitChapters('   \n  ')).toEqual({ chapters: [], method: 'single' })
  })

  it('splits 300 chapters in under 2 seconds', () => {
    const parts: string[] = []
    for (let n = 1; n <= 300; n++) parts.push(`${n}화\n${'가'.repeat(5000)}`)
    const started = Date.now()
    const r = splitChapters(parts.join('\n'))
    const elapsed = Date.now() - started
    expect(r.chapters).toHaveLength(300)
    expect(elapsed).toBeLessThan(2000)
  })
})
