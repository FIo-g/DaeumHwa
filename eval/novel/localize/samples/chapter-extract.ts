import { chapterExtractTask } from '@/ai/tasks/chapter-extract'

export const chapterExtractSample = chapterExtractTask.buildPrompt({
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
})
