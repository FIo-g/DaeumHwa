import { describe, expect, it } from 'vitest'
import {
  type ContextPack,
  PLANNED_THREAD_MARK,
  type PackThread,
  renderContextPack,
} from '@/ai/context'
import { continuityCheckTask } from '@/ai/tasks/continuity-check'

function thread(overrides: Partial<PackThread> & { ref: string; title: string }): PackThread {
  return {
    id: `id-${overrides.ref}`,
    description: '',
    status: 'planned',
    plantedPosition: null,
    targetPosition: null,
    importance: 'medium',
    overdue: false,
    ...overrides,
  }
}

function packWith(threads: PackThread[]): ContextPack {
  return {
    core: [],
    position: 3,
    entries: [],
    threads,
    relations: [],
    previousSummaries: [],
    namingRules: [],
    stats: { totalEntries: 0, selectedEntries: 0, approxChars: 0 },
  }
}

const threadLines = (text: string) => text.split('\n').filter((line) => line.startsWith('- [T'))

describe('P5 planned-thread mark (context render)', () => {
  it('default render has no mark', () => {
    const pack = packWith([thread({ ref: 'T1', title: '편지 봉인' })])
    const plain = renderContextPack(pack)
    expect(renderContextPack(pack, {})).toBe(plain)
    expect(renderContextPack(pack, { markPlannedThreads: false })).toBe(plain)
    expect(plain).not.toContain(PLANNED_THREAD_MARK)
  })

  it('marks a planned thread when asked', () => {
    const pack = packWith([
      thread({
        ref: 'T1',
        title: '편지 봉인',
        importance: 'high',
        targetPosition: 8,
        description: 'x',
      }),
    ])
    const marked = renderContextPack(pack, { markPlannedThreads: true })
    expect(marked).toContain(
      `- [T1] 편지 봉인 (중요도 높음, 계획됨, 목표 8화, ${PLANNED_THREAD_MARK}): x`,
    )
  })

  it('adds only the mark', () => {
    const pack = packWith([
      thread({
        ref: 'T1',
        title: '편지 봉인',
        importance: 'high',
        targetPosition: 8,
        description: 'x',
      }),
    ])
    const plainLine = threadLines(renderContextPack(pack))[0]
    const markedLine = threadLines(renderContextPack(pack, { markPlannedThreads: true }))[0]
    expect(markedLine.replace(`, ${PLANNED_THREAD_MARK}`, '')).toBe(plainLine)
  })

  it('does not mark planted or developing threads', () => {
    const pack = packWith([
      thread({ ref: 'T1', title: '계획 떡밥', status: 'planned' }),
      thread({ ref: 'T2', title: '심은 떡밥', status: 'planted', plantedPosition: 1 }),
      thread({ ref: 'T3', title: '진행 떡밥', status: 'developing', plantedPosition: 1 }),
    ])
    const marked = renderContextPack(pack, { markPlannedThreads: true })
    const lines = threadLines(marked)
    expect(lines.filter((line) => line.includes(PLANNED_THREAD_MARK))).toHaveLength(1)
    expect(lines[0]).toContain(PLANNED_THREAD_MARK)
    expect(lines[1]).not.toContain(PLANNED_THREAD_MARK)
    expect(lines[2]).not.toContain(PLANNED_THREAD_MARK)
  })

  it('puts the mark after the overdue flag', () => {
    const pack = packWith([
      thread({ ref: 'T1', title: '늦은 떡밥', overdue: true, targetPosition: 2 }),
    ])
    const marked = renderContextPack(pack, { markPlannedThreads: true })
    expect(marked).toContain(`계획됨, 목표 2화, 지연, ${PLANNED_THREAD_MARK})`)
  })

  it('leaves the other sections alone', () => {
    const pack = packWith([thread({ ref: 'T1', title: '편지 봉인', targetPosition: 8 })])
    const plain = renderContextPack(pack)
      .split('\n')
      .filter((line) => !line.startsWith('- [T'))
    const marked = renderContextPack(pack, { markPlannedThreads: true })
      .split('\n')
      .filter((line) => !line.startsWith('- [T'))
    expect(marked).toEqual(plain)
  })

  it('the continuity prompt carries no mark', () => {
    const pack = packWith([thread({ ref: 'T1', title: '편지 봉인', targetPosition: 8 })])
    const prompt = continuityCheckTask.buildPrompt({
      chapterText: '본문',
      chapterPosition: 3,
      chapterTitle: '제목',
      pack,
    })
    expect(prompt).not.toContain(PLANNED_THREAD_MARK)
  })
})
