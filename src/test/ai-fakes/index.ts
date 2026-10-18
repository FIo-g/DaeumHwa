import type { AiTaskName } from '@/db/types'
import { fakeChapterExtraction } from '@/test/ai-fakes/chapter-extract'
import { fakeContinuity } from '@/test/ai-fakes/continuity-check'
import { fakeAdvice } from '@/test/ai-fakes/direction-advice'
import { fakeDraft } from '@/test/ai-fakes/draft-chapter'
import { fakeInterviewExtraction } from '@/test/ai-fakes/interview-extract'
import { fakeInterviewQuestion } from '@/test/ai-fakes/interview-question'
import { fakeProofread } from '@/test/ai-fakes/proofread'
import { fakeReaderSim } from '@/test/ai-fakes/reader-sim'
import { fakeStyle } from '@/test/ai-fakes/style-suggest'

/** Fixed structured output per task, used by FakeAiClient. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FAKE_OUTPUTS: Partial<Record<AiTaskName, (input: any) => unknown>> = {
  'interview-question': fakeInterviewQuestion,
  'interview-extract': fakeInterviewExtraction,
  'chapter-extract': fakeChapterExtraction,
  'continuity-check': fakeContinuity,
  proofread: fakeProofread,
  'reader-sim': fakeReaderSim,
  'direction-advice': fakeAdvice,
  'style-suggest': fakeStyle,
}

/** Fixed streamed text per task, used by FakeAiClient. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FAKE_TEXT: Partial<Record<AiTaskName, (input: any) => string>> = {
  'draft-chapter': fakeDraft,
}
