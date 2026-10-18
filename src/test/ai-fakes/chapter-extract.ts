import type { Extraction } from '@/ai/extraction'
import type { ChapterExtractInput } from '@/ai/tasks/chapter-extract'
import { findMentions } from '@/lib/korean/mentions'
import { splitSentences } from '@/lib/korean/sentences'

// Stand-in output for the chapter-extract task. Used only by tests (see src/test/fake-ai.ts).

const SUMMARY_MAX_CHARS = 80
const EVIDENCE_MAX_CHARS = 120
const MAX_FAKE_NEW_ENTRIES = 5
const MIN_FAKE_NAME_COUNT = 3
/** Hangul word of 2 to 4 syllables directly followed by a subject particle. */
const SUBJECT_WORD = /[가-힣]{2,4}(?=[은는이가])/g

/** Deterministic stand-in: frequent subject words become characters, and every named entry gets one appearance fact. */
export function fakeChapterExtraction(input: ChapterExtractInput): Extraction {
  const sentences = splitSentences(input.chapterText)
  const summary = (sentences[0]?.text ?? '').slice(0, SUMMARY_MAX_CHARS)

  const knownNames = new Set(input.known.flatMap((k) => [k.name, ...k.aliases]))
  const newNames = candidateNames(input.chapterText)
    .filter((name) => !knownNames.has(name))
    .slice(0, MAX_FAKE_NEW_ENTRIES)

  const targets = [
    ...input.known.map((k) => ({ id: k.name, names: [k.name, ...k.aliases] })),
    ...newNames.map((name) => ({ id: name, names: [name] })),
  ]
  const namesById = new Map(targets.map((t) => [t.id, t.names]))
  const facts = findMentions(input.chapterText, targets).map((mention) => {
    const names = namesById.get(mention.entryId) ?? []
    const sentence = sentences.find((s) => names.some((n) => s.text.includes(n)))
    return {
      subjectName: mention.entryId,
      content: `${input.chapterPosition}화에 등장한다.`,
      evidence: (sentence?.text ?? '').slice(0, EVIDENCE_MAX_CHARS),
      suggestedStatus: 'confirmed' as const,
      supersedesFactRef: null,
    }
  })

  return {
    summary,
    entries: newNames.map((name) => ({
      name,
      kind: 'character' as const,
      aliases: [],
      summary: '',
      fields: [],
    })),
    facts,
    threads: [],
    relations: [],
  }
}

function candidateNames(text: string): string[] {
  const counts = new Map<string, number>()
  for (const match of text.matchAll(SUBJECT_WORD)) {
    counts.set(match[0], (counts.get(match[0]) ?? 0) + 1)
  }
  return [...counts].filter(([, count]) => count >= MIN_FAKE_NAME_COUNT).map(([word]) => word)
}
