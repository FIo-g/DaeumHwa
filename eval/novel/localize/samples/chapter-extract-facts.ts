import { chapterExtractFactsTask } from '@/ai/tasks/chapter-extract-parts'
import type { ChapterExtractInput } from '@/ai/tasks/chapter-extract'

// The English sample input is shared by the three part samples (the single-call sample has its own).
export const chapterExtractSampleInput: ChapterExtractInput = {
  chapterText: 'Mina opened the drawer at midnight.',
  chapterPosition: 3,
  chapterTitle: 'Midnight',
  known: [
    { name: 'Mina Park', kind: 'character', aliases: ['Min'] },
    { name: 'Han Siwoo', kind: 'character', aliases: [], pending: true },
  ],
  openThreads: [
    { ref: 'T1', title: 'Locked drawer', description: 'Who owns the key?', status: 'planted' },
    { ref: 'T2', title: 'Missing brother', description: '', status: 'planned' },
  ],
  knownFacts: [{ ref: 'F1', subjectName: 'Mina Park', content: 'Lost a finger' }],
}

export const chapterExtractFactsSample =
  chapterExtractFactsTask.buildPrompt(chapterExtractSampleInput)
