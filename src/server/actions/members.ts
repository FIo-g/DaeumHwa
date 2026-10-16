'use server'

import { z } from 'zod'
import type { InviteRow } from '@/db/types'
import type { ActionResult } from '@/lib/result'
import { requireRowWork } from '@/server/access'
import { revalidateWork, withAction } from '@/server/action-helpers'
import {
  acceptInvite,
  changeMemberRole,
  createInvite,
  removeMember,
  revokeInvite,
} from '@/server/members'

const CreateInviteSchema = z.object({
  workId: z.uuid(),
  role: z.enum(['editor', 'commenter', 'viewer']),
  expiresInDays: z.number().int().min(1).max(30).optional(),
})

const RevokeInviteSchema = z.object({
  inviteId: z.uuid(),
})

const AcceptInviteSchema = z.object({
  token: z.string().min(1).max(200),
})

const ChangeRoleSchema = z.object({
  workId: z.uuid(),
  userId: z.string().min(1),
  role: z.enum(['editor', 'commenter', 'viewer']),
})

const RemoveMemberSchema = z.object({
  workId: z.uuid(),
  userId: z.string().min(1),
})

export async function createInviteAction(input: unknown): Promise<ActionResult<InviteRow>> {
  return withAction(async (db, actor) => {
    const data = CreateInviteSchema.parse(input)
    const invite = await createInvite(db, actor, data)
    revalidateWork(data.workId)
    return invite
  })
}

export async function revokeInviteAction(input: unknown): Promise<ActionResult<void>> {
  return withAction(async (db, actor) => {
    const { inviteId } = RevokeInviteSchema.parse(input)
    const workId = await requireRowWork(db, 'work_invites', inviteId)
    await revokeInvite(db, actor, inviteId)
    revalidateWork(workId)
  })
}

export async function acceptInviteAction(
  input: unknown,
): Promise<ActionResult<{ workId: string }>> {
  return withAction(async (db, actor) => {
    const { token } = AcceptInviteSchema.parse(input)
    const result = await acceptInvite(db, actor, token)
    revalidateWork(result.workId)
    return result
  })
}

export async function changeMemberRoleAction(input: unknown): Promise<ActionResult<void>> {
  return withAction(async (db, actor) => {
    const data = ChangeRoleSchema.parse(input)
    await changeMemberRole(db, actor, data)
    revalidateWork(data.workId)
  })
}

export async function removeMemberAction(input: unknown): Promise<ActionResult<void>> {
  return withAction(async (db, actor) => {
    const data = RemoveMemberSchema.parse(input)
    await removeMember(db, actor, data)
    revalidateWork(data.workId)
  })
}
