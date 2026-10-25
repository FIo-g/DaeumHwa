// Assembler for the English system prompts of the novel eval. Each task's text lives in
// en/<task>.ts (translating the Korean `system` of src/ai/tasks/* rule by rule, same order, same XML
// tag names, same enum values); shared fragments live in en/shared.ts. Edit the task module, not this file.

import { isSpeechStyleEnabled } from '@/ai/voice'
import type { AiTaskName } from '@/db/types'
import { CHAPTER_EXTRACT_SYSTEM } from './en/chapter-extract'
import { CHAPTER_EXTRACT_FACTS_SYSTEM } from './en/chapter-extract-facts'
import { CHAPTER_EXTRACT_THREADS_SYSTEM } from './en/chapter-extract-threads'
import { CHAPTER_EXTRACT_RELATIONS_SYSTEM } from './en/chapter-extract-relations'
import { CONTINUITY_SYSTEM } from './en/continuity-check'
import { DIRECTION_ADVICE_SYSTEM } from './en/direction-advice'
import { DRAFT_BEATS_SYSTEM } from './en/draft-beats'
import { DRAFT_CHECK_SYSTEM } from './en/draft-check'
import { DRAFT_PLAN_SYSTEM } from './en/draft-plan'
import { DRAFT_CHAPTER_SYSTEM } from './en/draft-chapter'
import { DRAFT_EXPAND_SYSTEM } from './en/draft-expand'
import { DRAFT_REPAIR_SYSTEM } from './en/draft-repair'
import { buildEnInterviewExtractSystem } from './en/interview-extract'
import { buildEnInterviewQuestionSystem } from './en/interview-question'
import { PARAGRAPH_TRIM_SYSTEM } from './en/paragraph-trim'
import { PROOFREAD_SYSTEM } from './en/proofread'
import { READER_SIM_SYSTEM } from './en/reader-sim'
import { SCENE_REWRITE_SYSTEM } from './en/scene-rewrite'
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
  'draft-beats': DRAFT_BEATS_SYSTEM,
  'draft-check': DRAFT_CHECK_SYSTEM,
  // Placeholder English system for scene-fix: task 3 replaces it with the scene-fix twin.
  'scene-fix':
    'You are an assistant writer who rewrites one flagged scene. (Placeholder; task 3 fills the rules.)',
  'draft-plan': DRAFT_PLAN_SYSTEM,
  // Scene calls of the scenes draft mode share the English draft-chapter system, like draft-continue.
  'draft-scene': DRAFT_CHAPTER_SYSTEM,
  'draft-expand': DRAFT_EXPAND_SYSTEM,
  'scene-rewrite': SCENE_REWRITE_SYSTEM,
  'chapter-extract-facts': CHAPTER_EXTRACT_FACTS_SYSTEM,
  'chapter-extract-threads': CHAPTER_EXTRACT_THREADS_SYSTEM,
  'chapter-extract-relations': CHAPTER_EXTRACT_RELATIONS_SYSTEM,
}
