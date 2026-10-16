import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm'
import type { Db } from '@/db/client'
import { user, workInvites, workMembers, works } from '@/db/schema'
import type { Actor, InviteRow, Role } from '@/db/types'
import { AppError } from '@/lib/errors'
import { randomToken } from '@/lib/tokens'
import { getMembership, ROLE_RANK, requireRowWork, requireWorkRole } from '@/server/access'

// Team mode (spec §3.3, F16). Owners manage members and invites; members may leave on their own.

type InvitableRole = Exclude<Role, 'owner'>

const INVITABLE_ROLES: InvitableRole[] = ['editor', 'commenter', 'viewer']
const DEFAULT_INVITE_DAYS = 7
const MAX_INVITE_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

function assertInvitableRole(role: string): asserts role is InvitableRole {
  if (!(INVITABLE_ROLES as string[]).includes(role)) {
    throw new AppError('VALIDATION', '초대할 수 없는 역할입니다.')
  }
}

function isUsable(invite: InviteRow, now: Date): boolean {
  return !invite.acceptedAt && !invite.revokedAt && invite.expiresAt.getTime() > now.getTime()
}

/** Members of a work with their account details. Viewer role or higher. */
export async function listMembers(
  db: Db,
  actor: Actor,
  workId: string,
): Promise<{ userId: string; name: string; email: string; role: Role; createdAt: Date }[]> {
  await requireWorkRole(db, workId, actor.userId, 'viewer')
  const rows = await db
    .select({
      userId: workMembers.userId,
      name: user.name,
      email: user.email,
      role: workMembers.role,
      createdAt: workMembers.createdAt,
    })
    .from(workMembers)
    .innerJoin(user, eq(user.id, workMembers.userId))
    .where(eq(workMembers.workId, workId))
    .orderBy(asc(workMembers.createdAt))
  return rows
}

/** Creates a single-use invite link (7 days by default). Owner only. */
export async function createInvite(
  db: Db,
  actor: Actor,
  input: { workId: string; role: InvitableRole; expiresInDays?: number },
): Promise<InviteRow> {
  await requireWorkRole(db, input.workId, actor.userId, 'owner')
  assertInvitableRole(input.role)
  const days = input.expiresInDays ?? DEFAULT_INVITE_DAYS
  if (!Number.isInteger(days) || days < 1 || days > MAX_INVITE_DAYS) {
    throw new AppError('VALIDATION', '만료 기간은 1일부터 30일까지 정할 수 있습니다.')
  }
  const now = new Date()
  const [invite] = await db
    .insert(workInvites)
    .values({
      workId: input.workId,
      token: randomToken(32),
      role: input.role,
      createdBy: actor.userId,
      expiresAt: new Date(now.getTime() + days * DAY_MS),
    })
    .returning()
  return invite
}

/** Invites that can still be accepted. Owner only. */
export async function listInvites(db: Db, actor: Actor, workId: string): Promise<InviteRow[]> {
  await requireWorkRole(db, workId, actor.userId, 'owner')
  return db
    .select()
    .from(workInvites)
    .where(
      and(
        eq(workInvites.workId, workId),
        isNull(workInvites.acceptedAt),
        isNull(workInvites.revokedAt),
        gt(workInvites.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(workInvites.createdAt))
}

/** Cancels an invite that has not been accepted. Owner only. */
export async function revokeInvite(db: Db, actor: Actor, inviteId: string): Promise<void> {
  const workId = await requireRowWork(db, 'work_invites', inviteId)
  await requireWorkRole(db, workId, actor.userId, 'owner')
  const [invite] = await db.select().from(workInvites).where(eq(workInvites.id, inviteId)).limit(1)
  if (!invite) throw new AppError('NOT_FOUND', '초대를 찾을 수 없습니다.')
  if (invite.acceptedAt) throw new AppError('BAD_STATE', '이미 사용된 초대입니다.')
  if (invite.revokedAt) return
  await db.update(workInvites).set({ revokedAt: new Date() }).where(eq(workInvites.id, inviteId))
}

/**
 * Looks up an invite by its token for the accept page. No access check: the token is the
 * credential. `usable` is false when the invite is expired, revoked or already used.
 */
export async function getInviteByToken(
  db: Db,
  token: string,
): Promise<{ invite: InviteRow; workTitle: string; inviterName: string; usable: boolean } | null> {
  const [row] = await db
    .select({ invite: workInvites, workTitle: works.title, inviterName: user.name })
    .from(workInvites)
    .innerJoin(works, eq(works.id, workInvites.workId))
    .innerJoin(user, eq(user.id, workInvites.createdBy))
    .where(eq(workInvites.token, token))
    .limit(1)
  if (!row) return null
  return {
    invite: row.invite,
    workTitle: row.workTitle,
    inviterName: row.inviterName,
    usable: isUsable(row.invite, new Date()),
  }
}

/**
 * Accepts an invite. The invite is claimed atomically (single use). A new member gets the
 * invited role; an existing member keeps the higher of the two roles.
 */
export async function acceptInvite(
  db: Db,
  actor: Actor,
  token: string,
): Promise<{ workId: string }> {
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(workInvites)
      .where(eq(workInvites.token, token))
      .limit(1)
    if (!invite) throw new AppError('NOT_FOUND', '초대를 찾을 수 없습니다.')

    const now = new Date()
    const [claimed] = await tx
      .update(workInvites)
      .set({ acceptedBy: actor.userId, acceptedAt: now })
      .where(
        and(
          eq(workInvites.id, invite.id),
          isNull(workInvites.acceptedAt),
          isNull(workInvites.revokedAt),
          gt(workInvites.expiresAt, now),
        ),
      )
      .returning({ id: workInvites.id })
    if (!claimed) {
      throw new AppError('BAD_STATE', '만료되었거나 사용할 수 없는 초대입니다.')
    }

    const existing = await getMembership(tx, invite.workId, actor.userId)
    if (!existing) {
      await tx
        .insert(workMembers)
        .values({ workId: invite.workId, userId: actor.userId, role: invite.role })
    } else if (ROLE_RANK[invite.role] > ROLE_RANK[existing.role]) {
      await tx
        .update(workMembers)
        .set({ role: invite.role })
        .where(and(eq(workMembers.workId, invite.workId), eq(workMembers.userId, actor.userId)))
    }
    return { workId: invite.workId }
  })
}

/** Changes a member's role. Owner only. The owner's own role cannot change. */
export async function changeMemberRole(
  db: Db,
  actor: Actor,
  input: { workId: string; userId: string; role: InvitableRole },
): Promise<void> {
  await requireWorkRole(db, input.workId, actor.userId, 'owner')
  const target = await getMembership(db, input.workId, input.userId)
  if (!target) throw new AppError('NOT_FOUND', '구성원을 찾을 수 없습니다.')
  if (target.role === 'owner') {
    throw new AppError('BAD_STATE', '소유자의 역할은 바꿀 수 없습니다.')
  }
  assertInvitableRole(input.role)
  await db
    .update(workMembers)
    .set({ role: input.role })
    .where(and(eq(workMembers.workId, input.workId), eq(workMembers.userId, input.userId)))
}

/**
 * Removes a member. The owner can remove others; any member can remove themselves.
 * The owner cannot leave the work.
 */
export async function removeMember(
  db: Db,
  actor: Actor,
  input: { workId: string; userId: string },
): Promise<void> {
  const { role: actorRole } = await requireWorkRole(db, input.workId, actor.userId, 'viewer')
  const target = await getMembership(db, input.workId, input.userId)
  if (!target) throw new AppError('NOT_FOUND', '구성원을 찾을 수 없습니다.')
  if (target.role === 'owner') {
    throw new AppError('BAD_STATE', '소유자는 작품에서 나갈 수 없습니다.')
  }
  if (input.userId !== actor.userId && actorRole !== 'owner') {
    throw new AppError('FORBIDDEN', '이 작업을 할 권한이 없습니다.')
  }
  await db
    .delete(workMembers)
    .where(and(eq(workMembers.workId, input.workId), eq(workMembers.userId, input.userId)))
}
