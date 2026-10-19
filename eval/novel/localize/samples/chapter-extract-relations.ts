import { chapterExtractRelationsTask } from '@/ai/tasks/chapter-extract-parts'
import { chapterExtractSampleInput } from './chapter-extract-facts'

export const chapterExtractRelationsSample = chapterExtractRelationsTask.buildPrompt(
  chapterExtractSampleInput,
)
