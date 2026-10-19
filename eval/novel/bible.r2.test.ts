import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  type Bible,
  loadBible,
  loadRunBible,
  RUN_BIBLE_FILE,
  withVoicesInAnswerBank,
  writeRunBible,
} from './bible'

// Round 2 track M5 part a: the --speech on run copy of the story bible (voices in the answer bank).

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'novel-bible-m5-'))
  dirs.push(dir)
  return dir
}

function answerOf(bible: Bible, key: string): string {
  const item = bible.answerBank.find((entry) => entry.key === key)
  if (!item) throw new Error(`no answer bank entry ${key}`)
  return item.answer
}

describe('withVoicesInAnswerBank (ko)', () => {
  it('appends each voice to its character answer', () => {
    const copy = withVoicesInAnswerBank(loadBible('ko'))
    const protagonist = answerOf(copy, 'protagonist')
    expect(protagonist).toContain('한세린 말투: 반말.')
    expect(answerOf(copy, 'yunseo')).toContain('도윤서 말투: 존댓말.')
    expect(answerOf(copy, 'jiwon')).toContain('백지원 말투:')
    expect(answerOf(copy, 'seoyeon')).toContain('한서연 말투:')
    const minor = answerOf(copy, 'minor')
    expect(minor).toContain('윤해옥 말투:')
    expect(minor).toContain('곽두석 말투:')
    expect(minor.indexOf('윤해옥 말투:')).toBeLessThan(minor.indexOf('곽두석 말투:'))
  })
})

describe('withVoicesInAnswerBank (en)', () => {
  it('appends each voice with the English label', () => {
    const copy = withVoicesInAnswerBank(loadBible('en'))
    expect(answerOf(copy, 'protagonist')).toContain('Han Serin speech: Casual speech.')
    expect(answerOf(copy, 'minor')).toContain('Gwak Duseok speech:')
  })
})

describe('withVoicesInAnswerBank keeps everything else', () => {
  it('keeps keys, topics and the other answers', () => {
    const original = loadBible('ko')
    const copy = withVoicesInAnswerBank(original)
    expect(copy.answerBank.map((item) => item.key)).toEqual(
      original.answerBank.map((item) => item.key),
    )
    copy.answerBank.forEach((item, index) => {
      expect(item.topics).toEqual(original.answerBank[index].topics)
    })
    for (const key of [
      'protagonist-goal',
      'rule-key',
      'rule-bell',
      'places',
      'conflict',
      'threads',
      'ending',
      'style',
      'unknown',
    ]) {
      expect(answerOf(copy, key)).toBe(answerOf(original, key))
    }
  })

  it('leaves every field outside the answer bank equal', () => {
    const original = loadBible('ko')
    const copy = withVoicesInAnswerBank(original)
    expect({ ...copy, answerBank: undefined }).toEqual({ ...original, answerBank: undefined })
  })
})

describe('withVoicesInAnswerBank input', () => {
  it('does not change its input or the fixture', () => {
    const input = loadBible('ko')
    const before = JSON.stringify(input)
    withVoicesInAnswerBank(input)
    expect(JSON.stringify(input)).toBe(before)
    expect(answerOf(loadBible('ko'), 'protagonist')).not.toContain('말투:')
  })

  it('skips a character with an empty voice', () => {
    const input = loadBible('ko')
    const original = answerOf(input, 'protagonist')
    const character = input.characters.find((c) => c.key === 'serin')
    if (!character) throw new Error('no serin')
    const edited: Bible = {
      ...input,
      characters: input.characters.map((c) => (c === character ? { ...c, voice: '  ' } : c)),
    }
    expect(answerOf(withVoicesInAnswerBank(edited), 'protagonist')).toBe(original)
  })

  it('throws when a character has no answer bank entry', () => {
    const input = loadBible('ko')
    const edited: Bible = {
      ...input,
      characters: input.characters.map((c) =>
        c.key === 'serin' ? { ...c, name: '없는이름', aliases: [] } : c,
      ),
    }
    expect(() => withVoicesInAnswerBank(edited)).toThrow(/answer bank has no entry for character/)
  })
})

describe('run copy file', () => {
  it('writeRunBible and loadRunBible round trip', () => {
    const dir = join(tempDir(), 'nested', 'run')
    const copy = withVoicesInAnswerBank(loadBible('ko'))
    writeRunBible(dir, copy)
    expect(JSON.parse(readFileSync(join(dir, RUN_BIBLE_FILE), 'utf8'))).toEqual(copy)
    expect(loadRunBible(dir, 'ko')).toEqual(copy)
  })

  it('loadRunBible falls back to the fixture when no copy exists', () => {
    expect(loadRunBible(tempDir(), 'ko')).toEqual(loadBible('ko'))
  })
})

describe('author instructions name the run copy', () => {
  it('author.md points at <dir>/bible.json and keeps the draft_review rule', () => {
    const text = readFileSync(join(process.cwd(), 'eval/novel/agents/author.md'), 'utf8')
    const lines = text.split('\n')
    expect(lines.some((line) => line.includes('<dir>/bible.json') && line.includes('3.'))).toBe(
      true,
    )
    expect(
      lines.some(
        (line) => line.includes('author-context.json') && line.includes('<dir>/bible.json'),
      ),
    ).toBe(true)
    expect(text).toContain('is missing more than half of the `mustInclude` events')
  })
})
