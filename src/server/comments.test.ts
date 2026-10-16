import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@/db/client'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestChapter, createTestUser, createTestWork } from '@/test/factories'
import { addComment, deleteComment, listComments, setCommentResolved } from './comments'

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

async function setup() {
  const owner = await createTestUser(db, { name: '소유자' })
  const work = await createTestWork(db, owner.id)
  const chapter = await createTestChapter(db, work.id, { position: 1, body: '본문입니다.' })
  const commenter = await createTestUser(db, { name: '코멘터' })
  await addTestMember(db, work.id, commenter.id, 'commenter')
  const otherCommenter = await createTestUser(db, { name: '다른 코멘터' })
  await addTestMember(db, work.id, otherCommenter.id, 'commenter')
  const viewer = await createTestUser(db, { name: '독자' })
  await addTestMember(db, work.id, viewer.id, 'viewer')
  const editor = await createTestUser(db, { name: '편집자' })
  await addTestMember(db, work.id, editor.id, 'editor')
  const stranger = await createTestUser(db)
  return {
    owner: { userId: owner.id },
    commenter: { userId: commenter.id },
    otherCommenter: { userId: otherCommenter.id },
    viewer: { userId: viewer.id },
    editor: { userId: editor.id },
    stranger: { userId: stranger.id },
    chapterId: chapter.id,
  }
}

describe('addComment', () => {
  it('lets a commenter add a comment with its quote range', async () => {
    const s = await setup()
    const row = await addComment(db, s.commenter, {
      chapterId: s.chapterId,
      body: '이 문장 어색해요.',
      quote: '본문입니다.',
      quoteStart: 0,
      quoteEnd: 6,
    })
    expect(row.authorId).toBe(s.commenter.userId)
    expect(row.body).toBe('이 문장 어색해요.')
    expect(row.parentId).toBeNull()
    expect(row.status).toBe('open')
  })

  it('rejects an empty body with VALIDATION', async () => {
    const s = await setup()
    await expectAppError(
      addComment(db, s.commenter, { chapterId: s.chapterId, body: '   ' }),
      'VALIDATION',
    )
  })

  it('does not let a viewer comment', async () => {
    const s = await setup()
    await expectAppError(
      addComment(db, s.viewer, { chapterId: s.chapterId, body: '안녕' }),
      'FORBIDDEN',
    )
  })

  it('returns NOT_FOUND to a non-member', async () => {
    const s = await setup()
    await expectAppError(
      addComment(db, s.stranger, { chapterId: s.chapterId, body: '안녕' }),
      'NOT_FOUND',
    )
  })

  it('attaches a reply to a reply to the top-level parent', async () => {
    const s = await setup()
    const top = await addComment(db, s.commenter, { chapterId: s.chapterId, body: '1단계' })
    const reply = await addComment(db, s.otherCommenter, {
      chapterId: s.chapterId,
      body: '답글',
      parentId: top.id,
    })
    const replyToReply = await addComment(db, s.commenter, {
      chapterId: s.chapterId,
      body: '답글의 답글',
      parentId: reply.id,
    })
    expect(replyToReply.parentId).toBe(top.id)
  })
})

describe('listComments', () => {
  it('returns top-level comments with nested replies and author names', async () => {
    const s = await setup()
    const top = await addComment(db, s.commenter, {
      chapterId: s.chapterId,
      body: '질문',
      quoteStart: 4,
      quoteEnd: 8,
    })
    await addComment(db, s.otherCommenter, { chapterId: s.chapterId, body: '답', parentId: top.id })
    const views = await listComments(db, s.viewer, s.chapterId)
    expect(views).toHaveLength(1)
    expect(views[0].authorName).toBe('코멘터')
    expect(views[0].replies).toHaveLength(1)
    expect(views[0].replies[0].authorName).toBe('다른 코멘터')
  })

  it('returns NOT_FOUND to a non-member', async () => {
    const s = await setup()
    await expectAppError(listComments(db, s.stranger, s.chapterId), 'NOT_FOUND')
  })
})

describe('setCommentResolved', () => {
  it('lets the author resolve their own comment', async () => {
    const s = await setup()
    const row = await addComment(db, s.commenter, { chapterId: s.chapterId, body: '질문' })
    const resolved = await setCommentResolved(db, s.commenter, {
      commentId: row.id,
      resolved: true,
    })
    expect(resolved.status).toBe('resolved')
    expect(resolved.resolvedBy).toBe(s.commenter.userId)
    const reopened = await setCommentResolved(db, s.commenter, {
      commentId: row.id,
      resolved: false,
    })
    expect(reopened.status).toBe('open')
    expect(reopened.resolvedBy).toBeNull()
  })

  it('does not let another commenter resolve it', async () => {
    const s = await setup()
    const row = await addComment(db, s.commenter, { chapterId: s.chapterId, body: '질문' })
    await expectAppError(
      setCommentResolved(db, s.otherCommenter, { commentId: row.id, resolved: true }),
      'FORBIDDEN',
    )
  })

  it('lets an editor resolve any comment', async () => {
    const s = await setup()
    const row = await addComment(db, s.commenter, { chapterId: s.chapterId, body: '질문' })
    const resolved = await setCommentResolved(db, s.editor, {
      commentId: row.id,
      resolved: true,
    })
    expect(resolved.status).toBe('resolved')
  })
})

describe('deleteComment', () => {
  it('lets the author delete a comment and removes its replies', async () => {
    const s = await setup()
    const top = await addComment(db, s.commenter, { chapterId: s.chapterId, body: '질문' })
    await addComment(db, s.otherCommenter, { chapterId: s.chapterId, body: '답', parentId: top.id })
    await deleteComment(db, s.commenter, top.id)
    await expect(listComments(db, s.viewer, s.chapterId)).resolves.toEqual([])
  })

  it('does not let another commenter delete it', async () => {
    const s = await setup()
    const top = await addComment(db, s.commenter, { chapterId: s.chapterId, body: '질문' })
    await expectAppError(deleteComment(db, s.otherCommenter, top.id), 'FORBIDDEN')
  })

  it('lets the owner delete any comment', async () => {
    const s = await setup()
    const top = await addComment(db, s.commenter, { chapterId: s.chapterId, body: '질문' })
    await deleteComment(db, s.owner, top.id)
    await expect(listComments(db, s.viewer, s.chapterId)).resolves.toEqual([])
  })
})
