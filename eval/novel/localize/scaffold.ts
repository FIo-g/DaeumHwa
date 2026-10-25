import { BEATS_RULE } from '@/ai/tasks/draft-chapter'
import { BEATS_STATE_RULE } from '@/ai/tasks/draft-beats'
import { PLAN_INTRO_RULE } from '@/lib/draft-plan'
import { SCENE_PLAN_RULE } from '@/ai/tasks/continuity-check'
import { REQUESTS_HEADER } from '@/lib/directives'

// Turns the Korean scaffolding that product prompt builders emit (labels, empty markers, persona
// text, chapter numbers) into English. Content from the work itself is never matched by these rules,
// so English manuscripts and English wiki text pass through unchanged.

type Rule = readonly [pattern: string | RegExp, replacement: string]

// Ordered: every rule runs in sequence, so longer and more specific fragments come first. A bare
// label rule can also rewrite Hangul inside leaked Korean text, so the Hangul count is a lower bound.
const RULES: readonly Rule[] = [
  // Author requests (stage 2, the <author_requests> block). The header sentence comes first. The
  // scope and kind markers are whole-line pieces, so they come before the label rules further down.
  [
    REQUESTS_HEADER,
    "These are requests the author asked to keep. If one conflicts with this chapter's instructions, follow the instructions; otherwise keep them in every scene.",
  ],
  ['[작품 전체]', '[Whole work]'],
  [/\[(\d+)화만\]/g, '[Chapter $1 only]'],
  ['(말투: 반말)', '(speech: casual)'],
  ['(말투: 존댓말)', '(speech: polite)'],
  ['(쓰지 않을 말: ', '(do not write: '],
  [/\(분량: 공백 포함 (\d+)자\)/g, '(length: $1 characters with spaces)'],
  // Scene plan rule (brief P3, continuity check). The whole sentence comes first: it names places,
  // people and objects, which the bare label rules below would rewrite word by word.
  [
    SCENE_PLAN_RULE,
    "The scene list below is the plan made when this manuscript was drafted. It is not the wiki. Use it only to compare each scene's place, the people there and where objects are with the wiki. Do not flag a difference between the list and the manuscript on its own. Every flag still needs wiki grounds.",
  ],
  // Reader personas (src/ai/personas.ts), whole sentences first.
  [
    '이번 화부터 처음 읽는다. 설명 없는 인물과 용어에 헷갈린다.',
    'Reads from this chapter on, for the first time. Gets confused by characters and terms that go unexplained.',
  ],
  [
    '1화부터 꼼꼼히 읽어 왔다. 설정 오류와 늘어지는 전개에 민감하다.',
    'Has read carefully from Chapter 1. Sensitive to setting errors and sagging pacing.',
  ],
  [
    '출퇴근길 휴대폰으로 빠르게 넘긴다. 긴 설명과 느린 도입에서 이탈한다.',
    'Skims quickly on a phone during the commute. Drops off at long explanations and slow openings.',
  ],
  [
    '장르 클리셰를 잘 안다. 뻔한 전개에 지루해하고 신선한 반전을 원한다.',
    'Knows the genre clichés well. Gets bored by predictable plots and wants a fresh twist.',
  ],
  ['신규 유입 독자', 'New-arrival reader'],
  ['정주행 독자', 'Binge reader'],
  ['가볍게 보는 독자', 'Casual reader'],
  ['장르 매니아', 'Genre fan'],
  // Fixed phrases with a chapter number or count.
  [/현재 회차: (\d+)화/g, 'Current chapter: $1'],
  ['현재까지 연재된 회차: ', 'Chapters published so far: '],
  [/생략한 이전 질문: (\d+)개/g, 'Earlier questions left out: $1'],
  // Interview plan block (src/ai/tasks/interview-question.ts), longest first.
  [/미정 연속: (\d+)회/g, 'Consecutive undecided answers: $1'],
  [
    '다음 질문 방향: 남은 핵심 설정 또는 story로 전환',
    'Next question direction: another core setting or a story question',
  ],
  ['다음 질문 방향: 이야기(story)로 전환', 'Next question direction: switch to a story question'],
  ['닫은 주제(다시 묻지 않음): ', 'Closed topics (do not ask again): '],
  ['남은 핵심 설정: ', 'Remaining core settings: '],
  [/열린 회차 점검 지적: (\d+)건/g, 'Open continuity issues: $1'],
  [/사실 (\d+)개/g, '$1 facts'],
  [/최근 등장 (\d+)화/g, 'last seen Chapter $1'],
  [/회수 목표 (\d+)화/g, 'target Chapter $1'],
  [/목표 (\d+)화/g, 'target Chapter $1'],
  [/출처 (\d+)화/g, 'source Chapter $1'],
  [/(\d+)화에 심음/g, 'planted in Chapter $1'],
  [/(\d+)화부터/g, 'from Chapter $1'],
  [/(\d+)~(\d+)화/g, 'Chapters $1 to $2'],
  [/~(\d+)화/g, 'up to Chapter $1'],
  // Planned-thread mark (brief P5). The label is printed on planned threads in the draft's wiki block.
  ['지시에 있을 때만 쓴다', 'use only if the instructions mention it'],
  // Plan card (stage 1, draft-plan). Before the length and topic rules below: the scene header
  // carries a length, and "떡밥" in a label would otherwise be rewritten word by word.
  [
    PLAN_INTRO_RULE,
    'Write by the chapter plan below. Put an empty line, a single *** line and an empty line where the scene changes. Fill the length given for each scene. End the last scene with the scene named in the "Ending" line, not with a summary or a lesson.',
  ],
  [
    /장면 (\d+) \(도입, 공백 포함 약 ([\d,]+)자\)/g,
    'Scene $1 (opening, about $2 characters including spaces)',
  ],
  [
    /장면 (\d+) \(전환, 공백 포함 약 ([\d,]+)자\)/g,
    'Scene $1 (turn, about $2 characters including spaces)',
  ],
  [
    /장면 (\d+) \(고조, 공백 포함 약 ([\d,]+)자\)/g,
    'Scene $1 (rise, about $2 characters including spaces)',
  ],
  [
    /장면 (\d+) \(회차 끝, 공백 포함 약 ([\d,]+)자\)/g,
    'Scene $1 (ending, about $2 characters including spaces)',
  ],
  ['회차 끝 (질문): ', 'Ending (question): '],
  ['회차 끝 (위기): ', 'Ending (crisis): '],
  ['회차 끝 (반전): ', 'Ending (twist): '],
  ['작가 메모: ', 'Author note: '],
  ['현재 계획:', 'Current plan:'],
  ['일어나는 일: ', 'What happens: '],
  ['감정의 계기: ', 'Emotional trigger: '],
  ['움직일 떡밥: ', 'Threads to move: '],
  // Scene call (scenes mode, buildScenePrompt). The whole line comes first: it carries the counts.
  [
    /장면 (\d+)만 쓰고 멈춘다\. 이 장면은 공백 포함 약 ([\d,]+)자\. 지금까지 ([\d,]+)자를 썼고 회차 목표까지 ([\d,]+)자 남았다\./g,
    'Write only scene $1 and stop. This scene is about $2 characters including spaces. So far $3 characters are written, and $4 characters remain to the chapter target.',
  ],
  [' 이 장면이 마지막 장면이다.', ' This is the last scene.'],
  // Draft length lines (brief A). The continuation line comes first: its tail would otherwise match
  // the minimum-and-maximum rule below and leave Korean behind.
  [
    /지금까지 (\d+)자를 썼다\. 이어서 공백 포함 (\d+)자 이상, (\d+)자 이하로 쓴다\./g,
    'Written so far: $1 characters. Continue with at least $2 and at most $3 characters including spaces.',
  ],
  [
    /공백 포함 (\d+)자 이상, (\d+)자 이하/g,
    'at least $1 and at most $2 characters including spaces',
  ],
  [
    /장면 (\d+)개, 장면마다 공백 포함 (\d+)자 안팎/g,
    '$1 scenes, about $2 characters per scene including spaces',
  ],
  // Expansion length line (stage 1b, buildExpandPrompt). Before the generic rule below.
  [
    /공백 포함 약 (\d+)자 \(지금 (\d+)자\)/g,
    'about $1 characters including spaces (now $2 characters)',
  ],
  [/약 (\d+)자/g, 'about $1 characters'],
  // Section headers and fixed sentences.
  ['[인물 ', '[Character '],
  ['작품 전체', 'whole work'],
  ['읽을 회차: ', 'Chapter to read: '],
  [
    '위 내용을 보고 다음 질문을 하나 만드세요.',
    'Based on the information above, write one next question.',
  ],
  [
    '<unknown_names>에 적힌 이름이나 표현은 작가가 준 시놉시스, 위키, 답에 없다. 질문에 쓰지 않는다. 있는 이름만 쓰거나 이름 없이 묻는다.',
    'The names or phrases in <unknown_names> do not appear in the synopsis, wiki or answers the author gave. Do not use them in the question. Use only names that exist, or ask without a name.',
  ],
  ['(미정)', '(unspecified)'],
  ['(요약 없음)', '(no summary)'],
  ['(건너뜀)', '(skipped)'],
  ['(답 없음)', '(no answer)'],
  ['(없음)', '(none)'],
  ['등장 기록 없음', 'no appearance record'],
  ['한 줄 소개: ', 'One-line pitch: '],
  ['현재 회차', 'Current chapter'],
  ['(새 회차)', '(new chapter)'],
  ['로그라인: ', 'Logline: '],
  ['시놉시스: ', 'Synopsis: '],
  ['제목: ', 'Title: '],
  ['장르: ', 'Genre: '],
  ['카드 수: ', 'Card count: '],
  ['카드:', 'Cards:'],
  ['열린 떡밥: ', 'Open threads: '],
  ['최신 회차: ', 'Latest chapter: '],
  ['최근 회차 요약:', 'Recent chapter summaries:'],
  ['최근 독자 반응:', 'Recent reader reactions:'],
  ['주제: ', 'Topic: '],
  ['초점: ', 'Focus: '],
  ['질문: ', 'Question: '],
  ['답: ', 'Answer: '],
  [', 별칭: ', ', aliases: '],
  ['별칭: ', 'Aliases: '],
  ['요약: ', 'Summary: '],
  ['사실: ', 'Fact: '],
  ['잘못된 표기 ', 'misspellings '],
  ['중요도 ', 'importance '],
  ['승인 대기', 'pending approval'],
  ['예시:', 'Examples:'],
  ['규칙: ', 'Rules: '],
  ['말투: ', 'Speech: '],
  // Speech feature (brief B), off by default: neither string occurs in a flag-off prompt.
  ['말투 없음', 'no speech style'],
  [
    '인물별 말투. 대사는 이 말투를 따르고 바꾸지 않는다.',
    'Speech style per character. Dialogue follows it and never changes it.',
  ],
  // Voice-fix lines (stage 3, task 8): the level label after the speaker name.
  [': 반말 (', ': casual ('],
  [': 존댓말 (', ': polite ('],
  // Core interview topic names (INTERVIEW_TOPICS). After the section headers that contain them
  // (such as "열린 떡밥: "), and before the labels they contain (인물, 규칙, 장소).
  ['주요 인물', 'main characters'],
  ['세계관 규칙', 'world rules'],
  ['주요 장소', 'main places'],
  ['주인공', 'protagonist'],
  ['중심 갈등', 'central conflict'],
  ['떡밥', 'threads'],
  ['결말 방향', 'ending direction'],
  ['문체', 'style'],
  // Labels: thread status, importance, fact status, entry kind, character and place fields.
  ['계획됨', 'planned'],
  ['심음', 'planted'],
  ['발전 중', 'developing'],
  ['회수', 'resolved'],
  ['폐기', 'discarded'],
  ['높음', 'high'],
  ['보통', 'medium'],
  ['낮음', 'low'],
  ['확정', 'confirmed'],
  ['가정', 'assumed'],
  ['미정', 'undecided'],
  ['지연', 'overdue'],
  // Scene beat list (brief D, draft-beats). The beat rule comes first: it contains the shorter
  // labels below. The scene-number lookahead keeps the <scene_budget> line ("N개") out of it.
  [
    BEATS_RULE,
    'Keep the places, characters, object locations and event order of the scene list above exactly, and do not write a move to a place that is not in the list.',
  ],
  // Decision and stake lines (brief P2). The whole-sentence rule comes before the label rules.
  [
    BEATS_STATE_RULE,
    'If a scene has a "Decision state", do not reverse what the character decided in later sentences without a reason. Show "Expected and lost" through the character\'s gestures or the objects in their hands, without naming the emotion.',
  ],
  [/장면 (\d+)(?![\d개])/g, 'Scene $1'],
  ['인물: ', 'Characters: '],
  ['물건: ', 'Objects: '],
  ['결정 상태: ', 'Decision state: '],
  ['기대한 것과 잃은 것: ', 'Expected and lost: '],
  ['장소: ', 'Place: '],
  ['순서:', 'Sequence:'],
  // Scene rewrite findings (brief D, scene-rewrite), in the same block.
  ['문제 문장: ', 'Problem sentence: '],
  ['이유: ', 'Reason: '],
  ['위키: ', 'Wiki: '],
  ['제안: ', 'Suggestion: '],
  ['인물', 'character'],
  ['장소', 'place'],
  ['조직', 'organization'],
  ['물건', 'item'],
  ['규칙', 'rule'],
  ['사건', 'event'],
  ['용어', 'term'],
  ['기타', 'other'],
  ['역할', 'Role'],
  ['나이', 'Age'],
  ['성별', 'Gender'],
  ['외모', 'Appearance'],
  ['성격', 'Personality'],
  ['목표', 'Goal'],
  ['배경', 'Background'],
  ['위치', 'Location'],
  ['특징', 'Features'],
  // Chapter labels, last: any other "N화" becomes "Chapter N".
  [/(\d+)화/g, 'Chapter $1'],
]

/** Replaces Korean scaffolding in a prompt with English. Everything else is kept as written. */
export function translateScaffold(prompt: string): string {
  let text = prompt
  for (const [pattern, replacement] of RULES) {
    text =
      typeof pattern === 'string'
        ? text.split(pattern).join(replacement)
        : text.replace(pattern, replacement)
  }
  return text
}

/** Distinct Hangul runs in `text`, in order of first appearance. */
export function findHangul(text: string): string[] {
  return [...new Set(text.match(/\p{Script=Hangul}+/gu) ?? [])]
}

/** Number of Hangul characters in `text` (each syllable or jamo counts once). */
export function countHangul(text: string): number {
  return (text.match(/\p{Script=Hangul}/gu) ?? []).length
}
