import { paragraphTrimTask } from '@/ai/tasks/paragraph-trim'

export const paragraphTrimSample = paragraphTrimTask.buildPrompt({
  maxSentences: 3,
  items: [
    {
      index: 2,
      text: 'Mina ran. She stopped. She listened. The tower rang.',
      before: 'The door closed.',
      after: null,
    },
  ],
})
