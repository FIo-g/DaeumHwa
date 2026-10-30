import { readerSimTask } from '@/ai/tasks/reader-sim'
import { READER_PERSONAS } from '@/ai/personas'

export const readerSimSample = readerSimTask.buildPrompt({
  chapterText: 'Mina opened the drawer at midnight.',
  chapterPosition: 3,
  chapterTitle: 'Midnight',
  previousSummaries: [{ position: 2, summary: 'Mina finds a locked drawer.' }],
  work: { title: 'The Clock Tower Courier', genre: '', logline: '' },
  personas: READER_PERSONAS,
})
