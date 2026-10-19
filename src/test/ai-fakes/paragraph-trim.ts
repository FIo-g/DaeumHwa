// Stand-in answer for the paragraph-trim task (see src/test/fake-ai.ts). Splits each item into
// parts of `maxSentences` sentences, joined by a blank line. A quote that contains a terminator
// may be cut across two parts; that case is rejected by isValidTrim (out of scope for this fake).
import type { ParagraphTrimInput, ParagraphTrimOutput } from '@/ai/tasks/paragraph-trim'
import { splitSentences } from '@/lib/korean/sentences'

export function fakeParagraphTrim(input: ParagraphTrimInput): ParagraphTrimOutput {
  const size = Math.max(1, input.maxSentences)
  return {
    paragraphs: input.items.map((item) => {
      const sentences = splitSentences(item.text).map((sentence) => sentence.text)
      const parts: string[] = []
      for (let i = 0; i < sentences.length; i += size) {
        parts.push(sentences.slice(i, i + size).join(' '))
      }
      return { index: item.index, text: parts.join('\n\n') }
    }),
  }
}
