import type { AiTaskName } from '@/db/types'
import { fakeChapterExtraction } from '@/test/ai-fakes/chapter-extract'
import { fakeChapterFacts } from '@/test/ai-fakes/chapter-extract-facts'
import { fakeChapterRelations } from '@/test/ai-fakes/chapter-extract-relations'
import { fakeChapterThreads } from '@/test/ai-fakes/chapter-extract-threads'
import { fakeContinuity } from '@/test/ai-fakes/continuity-check'
import { fakeAdvice } from '@/test/ai-fakes/direction-advice'
import { fakeDraftBeats } from '@/test/ai-fakes/draft-beats'
import { fakeDraft, fakeDraftContinue } from '@/test/ai-fakes/draft-chapter'
import { fakeDraftRepair } from '@/test/ai-fakes/draft-repair'
import { fakeInterviewExtraction } from '@/test/ai-fakes/interview-extract'
import { fakeInterviewQuestion } from '@/test/ai-fakes/interview-question'
import { fakeParagraphTrim } from '@/test/ai-fakes/paragraph-trim'
import { fakeProofread } from '@/test/ai-fakes/proofread'
import { fakeReaderSim } from '@/test/ai-fakes/reader-sim'
import { fakeSceneRewrite } from '@/test/ai-fakes/scene-rewrite'
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
  'paragraph-trim': fakeParagraphTrim,
  'draft-repair': fakeDraftRepair,
  'draft-beats': fakeDraftBeats,
  'scene-rewrite': fakeSceneRewrite,
  'chapter-extract-facts': fakeChapterFacts,
  'chapter-extract-threads': fakeChapterThreads,
  'chapter-extract-relations': fakeChapterRelations,
}

/** Fixed streamed text per task, used by FakeAiClient. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FAKE_TEXT: Partial<Record<AiTaskName, (input: any) => string>> = {
  'draft-chapter': fakeDraft,
  'draft-continue': fakeDraftContinue,
}
