import type { Bible } from './bible'
import type { Answer, Pending } from './author-io'

// Deterministic stand-in for the human author. Approves and accepts everything, rates every draft
// usable at quality 3, and answers interview questions from the bible's answer bank.

export function fakeAnswer(p: Pending, bible: Bible): Answer {
  switch (p.kind) {
    case 'interview_answer': {
      const entry =
        bible.answerBank.find((item) =>
          item.topics.some((topic) =>
            topic
              .split(/\s+/)
              .filter(Boolean)
              .some((word) => p.question.includes(word)),
          ),
        ) ?? bible.answerBank[0]
      return {
        kind: 'interview_answer',
        answer: entry?.answer ?? '',
        bankKeys: entry ? [entry.key] : [],
      }
    }
    case 'proposals':
      return {
        kind: 'proposals',
        decisions: p.items.map((item) => ({
          id: item.id,
          approve: true,
          reason: 'fake author approves',
        })),
      }
    case 'draft_review':
      return { kind: 'draft_review', usable: true, quality: 3, reason: 'fake author' }
    case 'proofread':
      return {
        kind: 'proofread',
        decisions: p.items.map((item) => ({
          id: item.id,
          accept: true,
          reason: 'fake author accepts',
        })),
      }
    case 'continuity':
      return {
        kind: 'continuity',
        decisions: p.items.map((item) => ({
          id: item.id,
          valid: true,
          reason: 'fake author accepts',
        })),
      }
    case 'plan_review':
      return { kind: 'plan_review', approve: true }
    case 'advice_note': {
      const { recommendedIndex, options } = p.result
      const inRange = recommendedIndex >= 0 && recommendedIndex < options.length
      return {
        kind: 'advice_note',
        matchingOption: inRange ? recommendedIndex : null,
        note: 'fake author',
      }
    }
  }
}
