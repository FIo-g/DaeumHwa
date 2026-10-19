import type { ChapterExtractInput } from '@/ai/tasks/chapter-extract'
import { fakeChapterExtraction } from '@/test/ai-fakes/chapter-extract'

// Stand-in output for 'chapter-extract-facts': the facts part of the same fake extraction.
export function fakeChapterFacts(input: ChapterExtractInput) {
  const { summary, entries, facts } = fakeChapterExtraction(input)
  return { summary, entries, facts }
}
