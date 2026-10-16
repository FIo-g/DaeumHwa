'use server'

import { z } from 'zod'
import { FACT_STATUSES, PROPOSAL_STATUSES } from '@/db/types'
import type { ProposalRow } from '@/db/types'
import type { ActionResult } from '@/lib/result'
import { revalidateWork, withAction } from '@/server/action-helpers'
import {
  approveProposal,
  bulkApprove,
  type BulkApproveResult,
  listProposals,
  type ProposalView,
  rejectProposal,
} from '@/server/proposals'

const ApproveProposalSchema = z.object({
  proposalId: z.uuid(),
  payloadOverride: z.record(z.string(), z.unknown()).optional(),
  factStatus: z.enum(FACT_STATUSES).optional(),
  note: z.string().max(500).optional(),
})

const RejectProposalSchema = z.object({
  proposalId: z.uuid(),
  note: z.string().max(500).optional(),
})

const BulkApproveSchema = z.object({
  workId: z.uuid(),
  proposalIds: z.array(z.uuid()).max(500).optional(),
  sourceRef: z.string().max(200).optional(),
  useSuggestedStatus: z.boolean().optional(),
  defaultFactStatus: z.enum(FACT_STATUSES).optional(),
})

const ListProposalsSchema = z.object({
  workId: z.uuid(),
  chapterId: z.uuid().optional(),
  sourceRef: z.string().max(200).optional(),
  status: z.enum(PROPOSAL_STATUSES).optional(),
})

export async function approveProposalAction(
  input: unknown,
): Promise<ActionResult<{ proposal: ProposalRow; targetId: string | null }>> {
  return withAction(async (db, actor) => {
    const data = ApproveProposalSchema.parse(input)
    const result = await approveProposal(db, actor, data)
    revalidateWork(result.proposal.workId)
    return result
  })
}

export async function rejectProposalAction(input: unknown): Promise<ActionResult<ProposalRow>> {
  return withAction(async (db, actor) => {
    const data = RejectProposalSchema.parse(input)
    const row = await rejectProposal(db, actor, data)
    revalidateWork(row.workId)
    return row
  })
}

export async function bulkApproveAction(input: unknown): Promise<ActionResult<BulkApproveResult>> {
  return withAction(async (db, actor) => {
    const data = BulkApproveSchema.parse(input)
    const result = await bulkApprove(db, actor, data)
    if (result.approved > 0) revalidateWork(data.workId)
    return result
  })
}

export async function listProposalsAction(input: unknown): Promise<ActionResult<ProposalView[]>> {
  return withAction(async (db, actor) => {
    const { workId, ...filter } = ListProposalsSchema.parse(input)
    return listProposals(db, actor, workId, filter)
  })
}
