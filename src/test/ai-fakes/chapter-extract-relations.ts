import type { ChapterExtractInput } from '@/ai/tasks/chapter-extract'
import { fakeChapterExtraction } from '@/test/ai-fakes/chapter-extract'

// Stand-in output for 'chapter-extract-relations': the relations part of the same fake extraction.
export function fakeChapterRelations(input: ChapterExtractInput) {
  return { relations: fakeChapterExtraction(input).relations }
}
