// Assembler for the English system prompts of the novel eval. Each task's text lives in
// en/<task>.ts (translating the Korean `system` of src/ai/tasks/* rule by rule, same order, same XML
// tag names, same enum values); shared fragments live in en/shared.ts. Edit the task module, not this file.

import { isSpeechStyleEnabled } from '@/ai/voice'
import type { AiTaskName } from '@/db/types'
import { CHAPTER_EXTRACT_SYSTEM } from './en/chapter-extract'
import { CONTINUITY_SYSTEM } from './en/continuity-check'
import { DIRECTION_ADVICE_SYSTEM } from './en/direction-advice'
import { DRAFT_CHAPTER_SYSTEM } from './en/draft-chapter'
import { DRAFT_REPAIR_SYSTEM } from './en/draft-repair'
import { buildEnInterviewExtractSystem } from './en/interview-extract'
import { buildEnInterviewQuestionSystem } from './en/interview-question'
import { PARAGRAPH_TRIM_SYSTEM } from './en/paragraph-trim'
import { PROOFREAD_SYSTEM } from './en/proofread'
import { READER_SIM_SYSTEM } from './en/reader-sim'
import { STYLE_SUGGEST_SYSTEM } from './en/style-suggest'

export { EN_ENTITY_NAME_RULES, EN_INTERVIEW_TOPICS, EN_TAG_DATA_RULE } from './en/shared'

/** English `system` for every AI task, keyed by task name. Used by the eval client in en mode. */
export const EN_SYSTEMS: Record<AiTaskName, string> = {
  // Getters: the speech rules (brief B) follow the AI_SPEECH_STYLE flag, read on every access.
  get 'interview-question'() {
    return buildEnInterviewQuestionSystem(isSpeechStyleEnabled())
  },
  get 'interview-extract'() {
    return buildEnInterviewExtractSystem(isSpeechStyleEnabled())
  },
  'chapter-extract': CHAPTER_EXTRACT_SYSTEM,
  'continuity-check': CONTINUITY_SYSTEM,
  proofread: PROOFREAD_SYSTEM,
  'reader-sim': READER_SIM_SYSTEM,
  'direction-advice': DIRECTION_ADVICE_SYSTEM,
  'draft-chapter': DRAFT_CHAPTER_SYSTEM,
  // The continuation call reuses the draft-chapter system (brief A), so it shares the English text.
  'draft-continue': DRAFT_CHAPTER_SYSTEM,
  'style-suggest': STYLE_SUGGEST_SYSTEM,
  'paragraph-trim': PARAGRAPH_TRIM_SYSTEM,
  'draft-repair': DRAFT_REPAIR_SYSTEM,
}
