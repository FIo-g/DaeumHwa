import { directiveInferTask, type DirectiveInferInput } from '@/ai/tasks/directive-infer'

// The directive-infer prompt for one English run: a ban request and two hunks, so the requests
// block and every edit line are exercised.
export const directiveInferInput: DirectiveInferInput = {
  hunks: [
    { before: 'Mina lifted the corners of her mouth.', after: 'Mina smiled.' },
    {
      before: 'Jun nodded and said nothing for a moment.',
      after: 'Jun looked up and said nothing.',
    },
  ],
  requests: [
    {
      id: 'ban-1',
      scope: 'work',
      kind: 'ban',
      text: "Do not write 'for a moment'.",
      pattern: 'for a moment',
      speechLevel: null,
      targetChars: null,
      chapterPosition: null,
      entryId: null,
      entryName: null,
    },
  ],
  names: ['Mina'],
}

export const directiveInferSample = directiveInferTask.buildPrompt(directiveInferInput)
