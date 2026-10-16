import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestChapter, createTestUser, createTestWork } from '@/test/factories'
import {
  countOpenIssues,
  listIssues,
  reopenIssue,
  replaceOpenIssues,
  resolveIssue,
  type NewIssue,
} from './issues'

let db: Db

beforeEach(async () => {
  db = await createTestDb()
})

async function expectAppError(p: Promise<unknown>, code: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(AppError)
  expect((err as AppError).code).toBe(code)
}

function newIssue(overrides: Partial<NewIssue> = {}): NewIssue {
  return {
    kind: 'contradiction',
    severity: 'medium',
    quote: '그는 왼손잡이였다.',
    quoteStart: 10,
    quoteEnd: 20,
    entryId: null,
    factId: null,
    wikiExcerpt: '서윤은 오른손잡이다.',
    explanation: '손잡이 설정이 다릅니다.',
    suggestion: '오른손잡이로 고치세요.',
    ...overrides,
  }
}

async function setup() {
  const owner = await createTestUser(db)
  const work = await createTestWork(db, owner.id)
  const chapter = await createTestChapter(db, work.id, { position: 1, body: '본문' })
  const viewer = await createTestUser(db)
  await addTestMember(db, work.id, viewer.id, 'viewer')
  const editor = await createTestUser(db)
  await addTestMember(db, work.id, editor.id, 'editor')
  const stranger = await createTestUser(db)
  return {
    owner: { userId: owner.id },
    viewer: { userId: viewer.id },
    editor: { userId: editor.id },
    stranger: { userId: stranger.id },
    workId: work.id,
    chapterId: chapter.id,
  }
}

describe('replaceOpenIssues', () => {
  it('replaces open issues of the chapter and keeps resolved ones', async () => {
    const s = await setup()
    const first = await replaceOpenIssues(db, {
      workId: s.workId,
      chapterId: s.chapterId,
      runId: null,
      issues: [newIssue({ quote: '가' }), newIssue({ quote: '나' })],
    })
    expect(first).toHaveLength(2)

    await resolveIssue(db, s.editor, { issueId: first[0].id, status: 'accepted' })

    const second = await replaceOpenIssues(db, {
      workId: s.workId,
      chapterId: s.chapterId,
      runId: null,
      issues: [newIssue({ quote: '다' })],
    })
    expect(second.map((i) => i.quote)).toEqual(['다'])

    const all = await listIssues(db, s.owner, s.chapterId)
    expect(all.map((i) => `${i.quote}:${i.status}`).sort()).toEqual(
      ['가:accepted', '다:open'].sort(),
    )
  })
})

describe('listIssues', () => {
  it('sorts by severity high to low, then by quote position', async () => {
    const s = await setup()
    await replaceOpenIssues(db, {
      workId: s.workId,
      chapterId: s.chapterId,
      runId: null,
      issues: [
        newIssue({ quote: 'low', severity: 'low', quoteStart: 1 }),
        newIssue({ quote: 'med-late', severity: 'medium', quoteStart: 50 }),
        newIssue({ quote: 'high', severity: 'high', quoteStart: 90 }),
        newIssue({ quote: 'med-early', severity: 'medium', quoteStart: 5 }),
      ],
    })
    const rows = await listIssues(db, s.viewer, s.chapterId)
    expect(rows.map((r) => r.quote)).toEqual(['high', 'med-early', 'med-late', 'low'])
  })

  it('filters by status when asked', async () => {
    const s = await setup()
    const rows = await replaceOpenIssues(db, {
      workId: s.workId,
      chapterId: s.chapterId,
      runId: null,
      issues: [newIssue({ quote: 'a' }), newIssue({ quote: 'b' })],
    })
    await resolveIssue(db, s.editor, { issueId: rows[0].id, status: 'dismissed' })
    const open = await listIssues(db, s.viewer, s.chapterId, { statuses: ['open'] })
    expect(open.map((r) => r.quote)).toEqual(['b'])
  })

  it('returns NOT_FOUND to a non-member', async () => {
    const s = await setup()
    await expectAppError(listIssues(db, s.stranger, s.chapterId), 'NOT_FOUND')
  })
})

describe('resolveIssue and reopenIssue', () => {
  it('lets an editor resolve an open issue and records who resolved it', async () => {
    const s = await setup()
    const [issue] = await replaceOpenIssues(db, {
      workId: s.workId,
      chapterId: s.chapterId,
      runId: null,
      issues: [newIssue()],
    })
    const resolved = await resolveIssue(db, s.editor, {
      issueId: issue.id,
      status: 'wiki_updated',
    })
    expect(resolved.status).toBe('wiki_updated')
    expect(resolved.resolvedBy).toBe(s.editor.userId)
    expect(resolved.resolvedAt).toBeInstanceOf(Date)
  })

  it('refuses to resolve an issue that is already resolved', async () => {
    const s = await setup()
    const [issue] = await replaceOpenIssues(db, {
      workId: s.workId,
      chapterId: s.chapterId,
      runId: null,
      issues: [newIssue()],
    })
    await resolveIssue(db, s.editor, { issueId: issue.id, status: 'dismissed' })
    await expectAppError(
      resolveIssue(db, s.editor, { issueId: issue.id, status: 'accepted' }),
      'BAD_STATE',
    )
  })

  it('reopens a resolved issue', async () => {
    const s = await setup()
    const [issue] = await replaceOpenIssues(db, {
      workId: s.workId,
      chapterId: s.chapterId,
      runId: null,
      issues: [newIssue()],
    })
    await resolveIssue(db, s.editor, { issueId: issue.id, status: 'accepted' })
    const reopened = await reopenIssue(db, s.editor, issue.id)
    expect(reopened.status).toBe('open')
    expect(reopened.resolvedBy).toBeNull()
    expect(reopened.resolvedAt).toBeNull()
  })

  it('does not let a viewer resolve an issue', async () => {
    const s = await setup()
    const [issue] = await replaceOpenIssues(db, {
      workId: s.workId,
      chapterId: s.chapterId,
      runId: null,
      issues: [newIssue()],
    })
    await expectAppError(
      resolveIssue(db, s.viewer, { issueId: issue.id, status: 'accepted' }),
      'FORBIDDEN',
    )
  })
})

describe('countOpenIssues', () => {
  it('counts only open issues of the work', async () => {
    const s = await setup()
    const rows = await replaceOpenIssues(db, {
      workId: s.workId,
      chapterId: s.chapterId,
      runId: null,
      issues: [newIssue({ quote: 'a' }), newIssue({ quote: 'b' }), newIssue({ quote: 'c' })],
    })
    await resolveIssue(db, s.editor, { issueId: rows[0].id, status: 'accepted' })
    await expect(countOpenIssues(db, s.workId)).resolves.toBe(2)
  })
})
