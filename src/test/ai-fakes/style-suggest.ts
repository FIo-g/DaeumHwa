import type { StyleSuggestInput, StyleSuggestResult } from '@/ai/tasks/style-suggest'

// Stand-in output for the style-suggest task. Used only by tests (see src/test/fake-ai.ts).

/** Demo output: a fixed style card whose examples are the first three samples. */
export function fakeStyle(input: StyleSuggestInput): StyleSuggestResult {
  return {
    name: `${input.entryName} 말투`,
    tone: '(데모) 짧고 단호한 말투입니다.',
    rules: '- 반말을 쓴다.\n- 짧은 문장으로 끊어 말한다.\n- 감탄사를 자주 쓰지 않는다.',
    examples: input.samples.slice(0, 3).join('\n'),
  }
}
