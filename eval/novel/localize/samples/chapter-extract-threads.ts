import { chapterExtractThreadsTask } from '@/ai/tasks/chapter-extract-parts'
import { chapterExtractSampleInput } from './chapter-extract-facts'

export const chapterExtractThreadsSample = chapterExtractThreadsTask.buildPrompt(
  chapterExtractSampleInput,
)
