import { z } from 'zod'
import { DraftPlanCardSchema } from '@/ai/tasks/draft-plan'

export const PlanDraftSchema = z.object({
  workId: z.uuid(),
  chapterId: z.uuid().nullish(),
  instructions: z.string().max(5000),
  targetChars: z.number().int().min(500).max(20000).optional(),
  entryIds: z.array(z.uuid()).max(50),
  revision: z
    .object({
      card: DraftPlanCardSchema,
      note: z.string().trim().min(1).max(300),
      earlierNotes: z.array(z.string().trim().min(1).max(300)).max(5).default([]),
    })
    .optional(),
})
