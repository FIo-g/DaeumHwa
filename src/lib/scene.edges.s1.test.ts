import { describe, expect, it } from 'vitest'
import { createSceneEdgeFilter, isBreakLine } from '@/lib/scene'

/** Feeds the chunks in order and returns everything the filter let through. */
function run(chunks: string[]): string {
  const filter = createSceneEdgeFilter()
  let out = ''
  for (const chunk of chunks) out += filter.push(chunk)
  return out + filter.end()
}

/** The same text one character at a time, the worst case for a split line. */
function perChar(text: string): string[] {
  return Array.from(text)
}

describe('isBreakLine', () => {
  it('matches the break lines of a chapter and nothing else', () => {
    for (const line of ['***', '* * *', '  ---  ', '◇', '◆◆', '#'])
      expect(isBreakLine(line)).toBe(true)
    for (const line of ['', '**', '--', '# 제목', '*** 나', '서윤은 섰다.']) {
      expect(isBreakLine(line)).toBe(false)
    }
  })
})

describe('createSceneEdgeFilter', () => {
  const cases: [string, string, string][] = [
    ['plain prose', '나는 걸었다.', '나는 걸었다.'],
    ['leading blank lines and spaces', '\n\n  나는 걸었다.', '나는 걸었다.'],
    ['a leading break line', '***\n\n나는 걸었다.', '나는 걸었다.'],
    [
      'a leading break line with blank lines around it',
      '\n\n* * *\n\n나는 걸었다.',
      '나는 걸었다.',
    ],
    ['two leading break lines', '***\n---\n나는 걸었다.', '나는 걸었다.'],
    ['a trailing break line', '나는 걸었다.\n\n***', '나는 걸었다.'],
    ['a trailing break line with a newline', '나는 걸었다.\n\n---\n\n', '나는 걸었다.'],
    ['break lines on both edges', '***\n\n나는 걸었다.\n\n* * *', '나는 걸었다.'],
    ['a break line in the middle', '가\n\n***\n\n나', '가\n\n***\n\n나'],
    ['a line that only starts like a break line', '**\n나', '**\n나'],
    ['a trailing line that only starts like a break line', '나\n\n**', '나\n\n**'],
    ['a break line only', '\n***\n', ''],
    ['whitespace only', '  \n ', ''],
    ['nothing', '', ''],
    ['a bullet line', '- 나는 걸었다.', '- 나는 걸었다.'],
  ]

  it.each(cases)('%s', (_name, input, expected) => {
    expect(run([input])).toBe(expected)
    expect(run(perChar(input))).toBe(expected)
  })

  it('does not hold prose back while its line is still arriving', () => {
    const filter = createSceneEdgeFilter()
    expect(filter.push('나는')).toBe('나는')
    expect(filter.push(' 걸었다')).toBe(' 걸었다')
  })

  it('sends held blank and break lines once prose follows them', () => {
    const filter = createSceneEdgeFilter()
    expect(filter.push('가')).toBe('가')
    expect(filter.push('\n\n***\n')).toBe('')
    expect(filter.push('\n나')).toBe('\n\n***\n\n나')
  })
})
