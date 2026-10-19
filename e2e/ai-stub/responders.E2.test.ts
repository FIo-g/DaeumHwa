import { describe, expect, it } from 'vitest'
import { draftRepairTask, DraftRepairSchema } from '@/ai/tasks/draft-repair'
import { respond } from './responders'

describe('draft-repair stub answer', () => {
  it('answers with JSON that the task schema accepts', () => {
    const reply = respond({
      system: draftRepairTask.system,
      messages: [
        {
          role: 'user',
          content: draftRepairTask.buildPrompt({
            text: '안개가 계단을 반쯤 삼키고 있었다.',
            flags: [
              {
                kind: 'sample-copy',
                start: 0,
                end: 16,
                quote: '안개가 계단을 반쯤 삼키고 있었다.',
                reason: 'x',
              },
            ],
          }),
        },
      ],
      model: 'stub',
    })
    expect(reply.task).toBe('draft-repair')
    expect(DraftRepairSchema.parse(JSON.parse(reply.text))).toEqual({ edits: [] })
  })
})
