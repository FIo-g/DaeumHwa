import { isUndecidedAnswer } from '@/lib/interview-plan'
import { splitSentences } from '@/lib/korean/sentences'

// Filler words that carry no content on their own ("음...", "글쎄요").
const FILLER_ONLY = /^(음+|어+|흠+|글쎄요?)$/

/** Lowercased, with whitespace and punctuation removed. */
function compactSentence(text: string): string {
  return text.toLowerCase().replace(/[\s.,!?…~"'“”‘’]/g, '')
}

/**
 * True when the whole answer only says the topic is not decided yet ("아직 정하지 않았어요.").
 * Such an answer has nothing to extract, so the interview skips the AI call. Built on I's
 * isUndecidedAnswer; a sentence with any content makes the answer not undecided-only.
 */
export function isUndecidedOnlyAnswer(answer: string): boolean {
  let marker = false
  for (const sentence of splitSentences(answer)) {
    if (FILLER_ONLY.test(compactSentence(sentence.text))) continue
    if (!isUndecidedAnswer(sentence.text)) return false
    marker = true
  }
  return marker
}
