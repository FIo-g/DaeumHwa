import { EN_ENTITY_NAME_RULES, EN_TAG_DATA_RULE } from './shared'

const INTERVIEW_EXTRACT_LINES = [
  "You organize an author's interview answer into setting wiki candidates.",
  'Rules:',
  '- Organize only what the answer contains. Do not make anything up.',
  '- If the author stated something definitively, use suggestedStatus "confirmed". If the author hedged, as in "probably" or "might be", use "undecided". If it is inferred from the answer, use "assumed".',
  '- Existing cards (<known>) keep the same name. Put only new subjects in entries.',
  '- Do not put a fact already in <known_facts> into facts again, not even reworded. Put only newly learned content in facts.',
  '- Quote the answer sentence in evidence exactly, without changing a single character (one sentence).',
  '- Secrets or foreshadowing to be revealed later go in threads with kind "planted". existingThreadRef is always null. targetChapterPosition is null if the answer names no chapter.',
  '- Do not put a thread already in <threads> into threads again.',
  '- When focus is "story", put the future plot the author has decided on in threads with kind "planted". If the answer names a chapter, write that chapter number in targetChapterPosition.',
  '- When focus is "story", an idea the author mentions hesitantly goes in facts with suggestedStatus "undecided", not in threads. Set subjectName to the name of the related character card.',
  "- If the content changes a thread already in <threads> (for example, a change of target chapter), do not put it in threads. If that content is a fact of a character card, put it in facts with subjectName set to that card's name. Otherwise, discard it.",
  '- summary is null and supersedesFactRef is null.',
  EN_ENTITY_NAME_RULES,
  EN_TAG_DATA_RULE,
  '- Write all output in English.',
]

export const INTERVIEW_EXTRACT_SYSTEM = INTERVIEW_EXTRACT_LINES.join('\n')

/** English speech rules (mirrors of the Korean ones in src/ai/tasks/interview-extract.ts). */
export const EN_SPEECH_EXTRACT_APPEND =
  ' However, if the answer states a character\'s speech style (formal or casual speech, verbal tics), put that character in entries even if the card already exists, and write the speech style in one sentence under the key "speech" in fields.'
export const EN_SPEECH_EXTRACT_RULE =
  '- Always write a character card\'s speech style under the key "speech" in fields. Do not use any other key (for example "speech style", "tone" or "voice").'

/** The English interview extraction system. `speech` appends the speech rules at their anchors. */
export function buildEnInterviewExtractSystem(speech: boolean): string {
  if (!speech) return INTERVIEW_EXTRACT_SYSTEM
  const lines = [...INTERVIEW_EXTRACT_LINES]
  const known = lines.findIndex((line) => line.startsWith('- Existing cards (<known>)'))
  if (known === -1) throw new Error('EN interview-extract has no "Existing cards" line')
  lines[known] += EN_SPEECH_EXTRACT_APPEND
  const names = lines.indexOf(EN_ENTITY_NAME_RULES)
  if (names === -1) throw new Error('EN interview-extract has no EN_ENTITY_NAME_RULES line')
  lines.splice(names, 0, EN_SPEECH_EXTRACT_RULE)
  return lines.join('\n')
}
