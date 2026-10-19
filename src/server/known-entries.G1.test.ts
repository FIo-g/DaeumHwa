import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { facts, proposals } from '@/db/schema'
import { loadKnownFactTexts } from '@/server/known-entries'
import { createTestDb } from '@/test/db'
import { createTestEntry, createTestUser, createTestWork } from '@/test/factories'

let db: Db
let workId: string
let ownerId: string

beforeEach(async () => {
  db = await createTestDb()
  const owner = await createTestUser(db)
  ownerId = owner.id
  const work = await createTestWork(db, owner.id)
  workId = work.id
})

function factPayload(subjectName: string, entryId: string | null, content: string) {
  return {
    subjectName,
    entryId,
    content,
    suggestedStatus: 'confirmed',
    sourceChapterId: null,
    evidence: '',
    supersedesFactId: null,
  }
}

async function addPendingFact(
  forWork: string,
  payload: ReturnType<typeof factPayload>,
  status: 'pending' | 'approved' = 'pending',
): Promise<void> {
  await db.insert(proposals).values({
    workId: forWork,
    type: 'fact_create',
    payload,
    status,
    source: 'interview',
    sourceRef: null,
    chapterId: null,
  })
}

async function addWikiFact(
  forWork: string,
  values: {
    subjectName: string
    entryId: string | null
    content: string
    archivedAt?: Date | null
    supersededByFactId?: string | null
    validToPosition?: number | null
  },
): Promise<void> {
  await db.insert(facts).values({
    workId: forWork,
    subjectName: values.subjectName,
    entryId: values.entryId,
    content: values.content,
    archivedAt: values.archivedAt ?? null,
    supersededByFactId: values.supersededByFactId ?? null,
    validToPosition: values.validToPosition ?? null,
  })
}

describe('loadKnownFactTexts', () => {
  it('returns current wiki facts with pending: false', async () => {
    const seoyun = await createTestEntry(db, workId, { name: '서윤' })
    await addWikiFact(workId, {
      subjectName: '서윤',
      entryId: seoyun.id,
      content: '서윤은 열일곱 살 검객이다.',
    })

    const result = await loadKnownFactTexts(db, workId)
    expect(result).toEqual([
      {
        entryId: seoyun.id,
        subjectName: '서윤',
        content: '서윤은 열일곱 살 검객이다.',
        pending: false,
      },
    ])
  })

  it('returns pending fact_create payloads with pending: true, ahead of wiki facts', async () => {
    const seoyun = await createTestEntry(db, workId, { name: '서윤' })
    await addWikiFact(workId, {
      subjectName: '서윤',
      entryId: seoyun.id,
      content: '서윤은 검을 쓴다.',
    })
    await addPendingFact(workId, factPayload('세린', null, '세린은 종루에 산다.'))

    const result = await loadKnownFactTexts(db, workId)
    expect(result).toEqual([
      { entryId: null, subjectName: '세린', content: '세린은 종루에 산다.', pending: true },
      { entryId: seoyun.id, subjectName: '서윤', content: '서윤은 검을 쓴다.', pending: false },
    ])
  })

  it('leaves out archived, superseded and closed wiki facts and non-pending proposals', async () => {
    await addWikiFact(workId, {
      subjectName: '서윤',
      entryId: null,
      content: '보관된 사실이다.',
      archivedAt: new Date(),
    })
    await addWikiFact(workId, {
      subjectName: '서윤',
      entryId: null,
      content: '대체된 사실이다.',
      supersededByFactId: '00000000-0000-4000-8000-000000000001',
    })
    await addWikiFact(workId, {
      subjectName: '서윤',
      entryId: null,
      content: '끝난 사실이다.',
      validToPosition: 3,
    })
    await addPendingFact(workId, factPayload('서윤', null, '승인된 제안이다.'), 'approved')
    await addWikiFact(workId, { subjectName: '서윤', entryId: null, content: '현재 사실이다.' })

    const result = await loadKnownFactTexts(db, workId)
    expect(result.map((f) => f.content)).toEqual(['현재 사실이다.'])
  })

  it('does not return facts or pending proposals of another work', async () => {
    const other = await createTestWork(db, ownerId, { title: '다른 작품' })
    await addWikiFact(other.id, {
      subjectName: '민준',
      entryId: null,
      content: '다른 작품의 사실이다.',
    })
    await addPendingFact(other.id, factPayload('민준', null, '다른 작품의 대기 사실이다.'))
    await addPendingFact(workId, factPayload('서윤', null, '이 작품의 대기 사실이다.'))

    const result = await loadKnownFactTexts(db, workId)
    expect(result.map((f) => f.content)).toEqual(['이 작품의 대기 사실이다.'])
  })
})
