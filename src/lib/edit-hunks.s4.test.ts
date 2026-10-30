import { afterEach, describe, expect, it, vi } from 'vitest'
import { editHunks, isVagueRequest } from '@/lib/edit-hunks'

const diffState = vi.hoisted(() => ({ forceNull: false }))

vi.mock('@/lib/diff', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/diff')>()
  return {
    ...mod,
    diffTextsBounded: (...args: Parameters<typeof mod.diffTextsBounded>) => {
      if (diffState.forceNull) return null
      return mod.diffTextsBounded(...args)
    },
  }
})

afterEach(() => {
  diffState.forceNull = false
})

const AI_TEXT = [
  '세린이 문을 열었다.',
  '입꼬리가 올라갔다.',
  '안개가 방에 들어왔다.',
  '그녀는 창문을 보았다, 그리고 미소 지었다.',
  '바람이 차갑게 불었다.',
  '복도 끝에서 발소리가 났다.',
  '입꼬리가 올라갔다.',
  '종이 울렸다.',
].join(' ')

const SAVED_TEXT = [
  '세린이 문을 열었다.',
  '웃었다.',
  '안개가 방에 들어왔다.',
  '그녀는 창문을 보았다 그리고 미소 지었다.',
  '바람이 차갑게 불었다.',
  '복도 끝에서 발소리가 났다.',
  '웃었다.',
  '종이 울렸다.',
].join(' ')

describe('editHunks', () => {
  it('keeps the two phrase replacements with context and drops the comma fix', () => {
    const hunks = editHunks(AI_TEXT, SAVED_TEXT)
    expect(hunks).toHaveLength(2)
    for (const hunk of hunks) {
      expect(hunk.before).toContain('입꼬리가 올라갔다')
      expect(hunk.after).toContain('웃었다')
    }
    expect(hunks[0].before).toContain('문을 열었다')
    expect(hunks[0].after).toContain('문을 열었다')
    expect(hunks[1].before).toContain('발소리')
    expect(hunks[1].before).toContain('종이 울렸다')
    expect(AI_TEXT.indexOf(hunks[0].before.slice(0, 8))).toBeLessThan(
      AI_TEXT.indexOf(hunks[1].before.slice(0, 8)),
    )
  })

  it('keeps the 12 largest of 40 edits', () => {
    const aiParts: string[] = []
    const savedParts: string[] = []
    for (let i = 0; i < 40; i++) {
      aiParts.push(`원본 기록 ${i}번이다.`)
      aiParts.push(`중간 휴식 ${i}번째다.`)
      savedParts.push(`수정 기록 ${i}번이다.${'가'.repeat(i * 5)}`)
      savedParts.push(`중간 휴식 ${i}번째다.`)
    }
    const hunks = editHunks(aiParts.join(' '), savedParts.join(' '))
    expect(hunks).toHaveLength(12)
    const joined = hunks.map((hunk) => hunk.after).join('\n')
    expect(joined).toContain('수정 기록 39번이다.')
    expect(joined).not.toContain('수정 기록 0번이다.')
    const positions = hunks.map((hunk) => savedParts.join(' ').indexOf(hunk.after.slice(0, 10)))
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('returns [] when the bounded diff times out', () => {
    diffState.forceNull = true
    expect(editHunks(AI_TEXT, SAVED_TEXT)).toEqual([])
  })
})

describe('isVagueRequest', () => {
  it('flags a bare adverb phrase as vague', () => {
    expect(isVagueRequest('문장을 간결하게', [])).toBe(true)
  })

  it('keeps a quoted ban and a named speech rule', () => {
    expect(isVagueRequest("'입꼬리'는 쓰지 않는다", [])).toBe(false)
    expect(isVagueRequest('세린은 반말을 쓴다', ['세린'])).toBe(false)
  })
})
