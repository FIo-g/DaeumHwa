import {
  FactsPartSchema,
  type FactsPart,
  RelationsPartSchema,
  type RelationsPart,
  ThreadsPartSchema,
  type ThreadsPart,
} from '@/ai/extraction'
import { ENTITY_NAME_RULES } from '@/ai/extraction-rules'
import { neutralizeDeep, TAG_DATA_RULE } from '@/ai/prompt-utils'
import {
  type ChapterExtractInput,
  knownBlock,
  knownFactsBlock,
  manuscriptBlock,
  openThreadsBlock,
} from '@/ai/tasks/chapter-extract'
import type { AiTaskDef } from '@/ai/types'

// Split chapter extraction (local providers only; see src/ai/chapter-extract-run.ts). The single
// call in chapter-extract.ts is cut into three calls that run one after another: facts (entries,
// facts, summary), threads, and relations. Each system copies the matching rule lines of
// CHAPTER_EXTRACT_SYSTEM. A rule added there must be mirrored here (the verbatim test checks it).

export const CHAPTER_EXTRACT_FACTS_SYSTEM = `당신은 장기 연재 웹소설의 설정 기록 담당자다. 주어진 회차 원고에서 새 카드(entries), 사실(facts), 요약(summary)만 뽑는다. 다른 항목은 다른 담당자가 따로 뽑으니 쓰지 않는다.
규칙:
- 원고에 실제로 쓰인 내용만 뽑는다. 원고에 없는 내용을 지어내지 않는다.
- evidence에는 원고 문장을 한 글자도 바꾸지 말고 그대로 인용한다(한 문장, 120자 이내).
- 원고에 직접 쓰인 사실은 suggestedStatus "confirmed", 원고에서 추론한 것은 "assumed"로 둔다.
- 이미 알려진 대상(<known>)은 같은 이름을 쓰고, entries에는 목록에 없는 새 인물·장소·조직·물건·규칙·사건·용어만 넣는다.
- facts에는 나중에 설정 충돌을 찾는 데 쓸 구체적인 정보(외모, 능력, 나이, 관계, 소속, 과거사, 세계의 규칙, 약속)를 우선한다. 사소한 행동 묘사는 넣지 않는다.
- 이 회차에서 상태가 바뀐 사실(<known_facts>의 F ref와 다른 새 상태)은 supersedesFactRef에 그 ref를 넣는다.
${ENTITY_NAME_RULES}
- summary는 이 회차의 핵심 사건을 3문장 이내로 요약한다.
- threads와 relations는 이 답에 없다.
${TAG_DATA_RULE}
- 모든 출력은 한국어로 쓴다.`

export const CHAPTER_EXTRACT_THREADS_SYSTEM = `당신은 장기 연재 웹소설의 설정 기록 담당자다. 주어진 회차 원고에서 떡밥(threads)만 뽑는다. 다른 항목은 다른 담당자가 따로 뽑으니 쓰지 않는다.
규칙:
- 원고에 실제로 쓰인 내용만 뽑는다. 원고에 없는 내용을 지어내지 않는다.
- evidence에는 원고 문장을 한 글자도 바꾸지 말고 그대로 인용한다(한 문장, 120자 이내).
- threads는 독자에게 의문이나 기대를 남기고 아직 풀리지 않은 요소다. <open_threads>의 떡밥이 이 회차에서 진전되거나 풀리면 kind를 "developed" 또는 "resolved"로 하고 existingThreadRef에 그 T ref를 넣는다. 새로 심어진 떡밥은 kind "planted", existingThreadRef null.
- <open_threads>에서 "(계획됨)"으로 표시된 떡밥이 이 회차에서 처음 심어지면 kind "planted"로 하고 existingThreadRef에 그 T ref를 넣는다. 이미 심어진 떡밥을 다시 "planted"로 내지 않는다.
${TAG_DATA_RULE}
- 모든 출력은 한국어로 쓴다.`

export const CHAPTER_EXTRACT_RELATIONS_SYSTEM = `당신은 장기 연재 웹소설의 설정 기록 담당자다. 주어진 회차 원고에서 인물·장소·조직 사이의 관계(relations)만 뽑는다. 다른 항목은 다른 담당자가 따로 뽑으니 쓰지 않는다.
규칙:
- 원고에 실제로 쓰인 내용만 뽑는다. 원고에 없는 내용을 지어내지 않는다.
- evidence에는 원고 문장을 한 글자도 바꾸지 말고 그대로 인용한다(한 문장, 120자 이내).
- relations는 인물·장소·조직 사이의 관계(가족, 연인, 적대, 동료, 소속, 스승 등)가 드러날 때만 넣는다.
${ENTITY_NAME_RULES}
- relations의 양 끝(sourceName, targetName)은 <known>에 적힌 이름을 그대로 쓴다.
${TAG_DATA_RULE}
- 모든 출력은 한국어로 쓴다.`

export const chapterExtractFactsTask: AiTaskDef<ChapterExtractInput, FactsPart> = {
  name: 'chapter-extract-facts',
  effort: 'medium',
  maxTokens: 8000,
  system: CHAPTER_EXTRACT_FACTS_SYSTEM,
  buildPrompt(raw) {
    const input = neutralizeDeep(raw)
    return [knownBlock(input), '', knownFactsBlock(input), '', manuscriptBlock(input)].join('\n')
  },
  schema: FactsPartSchema,
}

export const chapterExtractThreadsTask: AiTaskDef<ChapterExtractInput, ThreadsPart> = {
  name: 'chapter-extract-threads',
  effort: 'medium',
  maxTokens: 4000,
  system: CHAPTER_EXTRACT_THREADS_SYSTEM,
  buildPrompt(raw) {
    const input = neutralizeDeep(raw)
    return [openThreadsBlock(input), '', manuscriptBlock(input)].join('\n')
  },
  schema: ThreadsPartSchema,
}

export const chapterExtractRelationsTask: AiTaskDef<ChapterExtractInput, RelationsPart> = {
  name: 'chapter-extract-relations',
  effort: 'medium',
  maxTokens: 4000,
  system: CHAPTER_EXTRACT_RELATIONS_SYSTEM,
  buildPrompt(raw) {
    const input = neutralizeDeep(raw)
    return [knownBlock(input), '', manuscriptBlock(input)].join('\n')
  },
  schema: RelationsPartSchema,
}
