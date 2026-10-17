import { describe, expect, it } from 'vitest'
import { createTextApi } from '@/workers/text-api'

describe('createTextApi', () => {
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
