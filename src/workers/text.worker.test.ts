import { describe, expect, it, vi } from 'vitest'
import { createTextApi } from '@/workers/text-api'

describe('createTextApi', () => {
  it('answers ping so the client knows the worker is alive', async () => {
    expect(await createTextApi().ping()).toBe('pong')
  })

  it('splits, searches and computes schedules through one API', async () => {
    const api = createTextApi()
    const split = await api.splitChapters('1화\n가\n2화\n나')
    expect(split.chapters.map((c) => c.title)).toEqual(['1화', '2화'])

    await api.setSearchItems([
      { id: 'a', kind: 'character', name: '이서윤', aliases: ['서윤'], summary: '' },
    ])
    expect((await api.search('ㅅㅇ')).map((i) => i.id)).toEqual(['a'])

    const schedule = await api.computeSchedule(
      {
        settings: {
          absenceThreshold: 10,
          publishDays: [1, 2, 3, 4, 5],
          chaptersPerPublishDay: 1,
          bufferTarget: 5,
          targetChars: 5500,
        },
        chapters: [],
        items: [],
      },
      '2026-10-16',
    )
    expect(schedule.bufferCount).toBe(0)
  })
})

describe('text.worker entry', () => {
  it('exposes the text API through Comlink', async () => {
    vi.resetModules()
    const expose = vi.fn()
    vi.doMock('comlink', () => ({ expose }))
    try {
      await import('@/workers/text.worker')
      expect(expose).toHaveBeenCalledTimes(1)
      expect(expose.mock.calls[0][0]).toHaveProperty('splitChapters')
    } finally {
      vi.doUnmock('comlink')
      vi.resetModules()
    }
  })
})
