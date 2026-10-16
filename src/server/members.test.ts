import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@/db/client'
import { AppError } from '@/lib/errors'
import { createTestDb } from '@/test/db'
import { addTestMember, createTestUser, createTestWork } from '@/test/factories'
import { getMembership } from './access'
import {
  acceptInvite,
  changeMemberRole,
  createInvite,
  getInviteByToken,
  listInvites,
  listMembers,
  removeMember,
  revokeInvite,
} from './members'

let db: Db

beforeEach(async () => {
  db = await createTestDb()
})

afterEach(() => {
  vi.useRealTimers()
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
  const work = await createTestWork(db, owner.id, { title: '별빛 연대기' })
  const editor = await createTestUser(db, { name: '편집자' })
  await addTestMember(db, work.id, editor.id, 'editor')
  const viewer = await createTestUser(db, { name: '보기 전용' })
  await addTestMember(db, work.id, viewer.id, 'viewer')
  const stranger = await createTestUser(db, { name: '새 사람' })
  return {
    owner: { userId: owner.id },
    editor: { userId: editor.id },
    viewer: { userId: viewer.id },
    stranger: { userId: stranger.id },
    workId: work.id,
  }
}

describe('createInvite and acceptInvite', () => {
  it('lets a stranger join with the invited role after accepting', async () => {
    const s = await setup()
    const invite = await createInvite(db, s.owner, { workId: s.workId, role: 'commenter' })
    expect(invite.token.length).toBeGreaterThanOrEqual(40)
    expect(invite.role).toBe('commenter')

    const result = await acceptInvite(db, s.stranger, invite.token)
    expect(result).toEqual({ workId: s.workId })
    await expect(getMembership(db, s.workId, s.stranger.userId)).resolves.toEqual({
      role: 'commenter',
    })
  })

  it('refuses a second use of the same invite with BAD_STATE', async () => {
    const s = await setup()
    const invite = await createInvite(db, s.owner, { workId: s.workId, role: 'viewer' })
    await acceptInvite(db, s.stranger, invite.token)
    const another = await createTestUser(db)
    await expectAppError(acceptInvite(db, { userId: another.id }, invite.token), 'BAD_STATE')
  })

  it('refuses an expired invite with BAD_STATE', async () => {
    const s = await setup()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-16T00:00:00Z'))
    const invite = await createInvite(db, s.owner, { workId: s.workId, role: 'editor' })
    vi.setSystemTime(new Date('2026-10-24T00:00:00Z'))
    await expectAppError(acceptInvite(db, s.stranger, invite.token), 'BAD_STATE')
    await expect(getMembership(db, s.workId, s.stranger.userId)).resolves.toBeNull()
  })

  it('keeps the higher role when an existing editor accepts a viewer invite', async () => {
    const s = await setup()
    const invite = await createInvite(db, s.owner, { workId: s.workId, role: 'viewer' })
    await acceptInvite(db, s.editor, invite.token)
    await expect(getMembership(db, s.workId, s.editor.userId)).resolves.toEqual({
      role: 'editor',
    })
  })

  it('upgrades a viewer who accepts an editor invite', async () => {
    const s = await setup()
    const invite = await createInvite(db, s.owner, { workId: s.workId, role: 'editor' })
    await acceptInvite(db, s.viewer, invite.token)
    await expect(getMembership(db, s.workId, s.viewer.userId)).resolves.toEqual({
      role: 'editor',
    })
  })

  it('refuses an unknown token with NOT_FOUND', async () => {
    const s = await setup()
    await expectAppError(acceptInvite(db, s.stranger, 'no-such-token'), 'NOT_FOUND')
  })

  it('does not let a non-owner create an invite', async () => {
    const s = await setup()
    await expectAppError(
      createInvite(db, s.editor, { workId: s.workId, role: 'viewer' }),
      'FORBIDDEN',
    )
  })

  it('never creates an owner invite', async () => {
    const s = await setup()
    await expectAppError(
      // @ts-expect-error owner is not an invitable role; the runtime check must still reject it
      createInvite(db, s.owner, { workId: s.workId, role: 'owner' }),
      'VALIDATION',
    )
  })

  it('uses a 7 day expiry by default', async () => {
    const s = await setup()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-16T00:00:00Z'))
    const invite = await createInvite(db, s.owner, { workId: s.workId, role: 'viewer' })
    expect(invite.expiresAt.toISOString()).toBe('2026-10-23T00:00:00.000Z')
  })
})

describe('getInviteByToken', () => {
  it('describes a usable invite with the work title and inviter name', async () => {
    const s = await setup()
    const invite = await createInvite(db, s.owner, { workId: s.workId, role: 'viewer' })
    const found = await getInviteByToken(db, invite.token)
    expect(found).not.toBeNull()
    expect(found?.workTitle).toBe('별빛 연대기')
    expect(found?.inviterName).toBe('소유자')
    expect(found?.usable).toBe(true)
  })

  it('returns null for an unknown token', async () => {
    await expect(getInviteByToken(db, 'nope')).resolves.toBeNull()
  })

  it('marks a revoked invite as not usable', async () => {
    const s = await setup()
    const invite = await createInvite(db, s.owner, { workId: s.workId, role: 'viewer' })
    await revokeInvite(db, s.owner, invite.id)
    const found = await getInviteByToken(db, invite.token)
    expect(found?.usable).toBe(false)
    await expectAppError(acceptInvite(db, s.stranger, invite.token), 'BAD_STATE')
  })
})

describe('listInvites and revokeInvite', () => {
  it('lists only active invites', async () => {
    const s = await setup()
    const active = await createInvite(db, s.owner, { workId: s.workId, role: 'viewer' })
    const revoked = await createInvite(db, s.owner, { workId: s.workId, role: 'editor' })
    await revokeInvite(db, s.owner, revoked.id)
    const rows = await listInvites(db, s.owner, s.workId)
    expect(rows.map((r) => r.id)).toEqual([active.id])
  })

  it('does not let an editor revoke an invite', async () => {
    const s = await setup()
    const invite = await createInvite(db, s.owner, { workId: s.workId, role: 'viewer' })
    await expectAppError(revokeInvite(db, s.editor, invite.id), 'FORBIDDEN')
  })
})

describe('listMembers', () => {
  it('lists members for a viewer', async () => {
    const s = await setup()
    const rows = await listMembers(db, s.viewer, s.workId)
    expect(rows.map((r) => [r.name, r.role]).sort()).toEqual(
      [
        ['편집자', 'editor'],
        ['보기 전용', 'viewer'],
        ['소유자', 'owner'],
      ].sort(),
    )
  })

  it('returns NOT_FOUND to a non-member', async () => {
    const s = await setup()
    await expectAppError(listMembers(db, s.stranger, s.workId), 'NOT_FOUND')
  })
})

describe('changeMemberRole', () => {
  it('lets the owner change a member role', async () => {
    const s = await setup()
    await changeMemberRole(db, s.owner, {
      workId: s.workId,
      userId: s.viewer.userId,
      role: 'commenter',
    })
    await expect(getMembership(db, s.workId, s.viewer.userId)).resolves.toEqual({
      role: 'commenter',
    })
  })

  it('refuses to change the owner role with BAD_STATE', async () => {
    const s = await setup()
    await expectAppError(
      changeMemberRole(db, s.owner, {
        workId: s.workId,
        userId: s.owner.userId,
        role: 'editor',
      }),
      'BAD_STATE',
    )
  })

  it('does not let an editor change roles', async () => {
    const s = await setup()
    await expectAppError(
      changeMemberRole(db, s.editor, {
        workId: s.workId,
        userId: s.viewer.userId,
        role: 'editor',
      }),
      'FORBIDDEN',
    )
  })
})

describe('removeMember', () => {
  it('lets a member leave the work', async () => {
    const s = await setup()
    await removeMember(db, s.viewer, { workId: s.workId, userId: s.viewer.userId })
    await expect(getMembership(db, s.workId, s.viewer.userId)).resolves.toBeNull()
  })

  it('lets the owner remove another member', async () => {
    const s = await setup()
    await removeMember(db, s.owner, { workId: s.workId, userId: s.editor.userId })
    await expect(getMembership(db, s.workId, s.editor.userId)).resolves.toBeNull()
  })

  it('does not let a member remove someone else', async () => {
    const s = await setup()
    await expectAppError(
      removeMember(db, s.editor, { workId: s.workId, userId: s.viewer.userId }),
      'FORBIDDEN',
    )
  })

  it('refuses to remove the owner with BAD_STATE', async () => {
    const s = await setup()
    await expectAppError(
      removeMember(db, s.owner, { workId: s.workId, userId: s.owner.userId }),
      'BAD_STATE',
    )
  })
})
