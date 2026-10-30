import type { ChapterExtractInput } from '@/ai/tasks/chapter-extract'
import { fakeChapterExtraction } from '@/test/ai-fakes/chapter-extract'

// Stand-in output for 'chapter-extract-threads': the threads part of the same fake extraction.
export function fakeChapterThreads(input: ChapterExtractInput) {
  return { threads: fakeChapterExtraction(input).threads }
}
