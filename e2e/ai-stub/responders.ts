// Fixed answers for the E2E AI stub. Each task is recognized by its exact system prompt, then
// its user prompt is read with the section tags the task's buildPrompt writes. No model is called.

import { continuityCheckTask } from '@/ai/tasks/continuity-check'
import { chapterExtractTask } from '@/ai/tasks/chapter-extract'
import { DRAFT_SYSTEM } from '@/ai/tasks/draft-chapter'
import { draftRepairTask } from '@/ai/tasks/draft-repair'
import { directionAdviceTask } from '@/ai/tasks/direction-advice'
import { interviewExtractTask } from '@/ai/tasks/interview-extract'
import { interviewQuestionTask } from '@/ai/tasks/interview-question'
import { proofreadTask } from '@/ai/tasks/proofread'
import { readerSimTask } from '@/ai/tasks/reader-sim'
import { styleSuggestTask } from '@/ai/tasks/style-suggest'

export type StubMessage = { role: string; content: string }

export type RespondBody = {
  system: string | { type: 'text'; text: string }[]
  messages: StubMessage[]
  model: string
  stream?: boolean
}

export type StubReply = { task: string; text: string; delayMs: number }

export class UnknownSystemError extends Error {}

const SLOW_MARKER = '[느리게]'
const SLOW_DELAY_MS = 30_000

type Answer = (prompt: string) => unknown

const ANSWERS: { task: string; system: string; answer: Answer }[] = [
  { task: 'continuity-check', system: continuityCheckTask.system, answer: continuityAnswer },
  { task: 'chapter-extract', system: chapterExtractTask.system, answer: chapterExtractAnswer },
  {
    task: 'interview-extract',
    system: interviewExtractTask.system,
    answer: interviewExtractAnswer,
  },
  { task: 'interview-question', system: interviewQuestionTask.system, answer: questionAnswer },
  { task: 'proofread', system: proofreadTask.system, answer: () => ({ suggestions: [] }) },
  { task: 'reader-sim', system: readerSimTask.system, answer: readerSimAnswer },
  { task: 'direction-advice', system: directionAdviceTask.system, answer: adviceAnswer },
  { task: 'style-suggest', system: styleSuggestTask.system, answer: styleAnswer },
  { task: 'draft-chapter', system: DRAFT_SYSTEM, answer: draftAnswer },
  { task: 'draft-repair', system: draftRepairTask.system, answer: () => ({ edits: [] }) },
]

const DRAFT_TEXT = '서윤은 조용히 문을 열었다. 바람이 차가웠다.'
const CONTINUE_TEXT = '바람은 밤새 잦아들었다. 아침 빛이 문틈으로 들어왔다.'

/** The continuation shares the draft system prompt, so it is told apart by its <draft_so_far> section. */
function draftAnswer(prompt: string): string {
  return prompt.includes('<draft_so_far>') ? CONTINUE_TEXT : DRAFT_TEXT
}

/** Answers one request. Throws UnknownSystemError when the system prompt is not a known task. */
export function respond(body: RespondBody): StubReply {
  const system = systemText(body.system)
  const entry = ANSWERS.find((candidate) => candidate.system === system)
  if (!entry) throw new UnknownSystemError('Unknown system prompt for the E2E AI stub')
  const prompt = body.messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
    .join('\n\n')
  const answer = entry.answer(prompt)
  return {
    task: entry.task,
    text: typeof answer === 'string' ? answer : JSON.stringify(answer),
    delayMs: prompt.includes(SLOW_MARKER) ? SLOW_DELAY_MS : 0,
  }
}

function systemText(system: RespondBody['system']): string {
  return typeof system === 'string' ? system : system.map((block) => block.text).join('')
}

/** Text inside the first <tag ...>...</tag> pair of the prompt, or ''. */
function section(prompt: string, tag: string): string {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(prompt)
  return match?.[1] ?? ''
}

/** Sentences of a passage. Text without final punctuation counts as one sentence. */
function sentences(text: string): string[] {
  const found = text.match(/[^.!?]+[.!?]+/g) ?? []
  const parts = found.length > 0 ? found : [text]
  return parts.map((part) => part.trim()).filter((part) => part.length > 0)
}

/** Names listed as "- name (...)" lines, as the thread and character sections print them. */
function listedNames(text: string): string[] {
  return text
    .split('\n')
    .map((line) => /^- (.+?) \(/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined)
}

function stripParticle(token: string): string {
  return token.replace(/(은|는|이|가|을|를|의|에|도|와|과)$/, '')
}

type StubFact = { ref: string; status: string; content: string }
type StubCard = { ref: string; names: string[]; facts: StubFact[] }

/** Entry cards and their facts from the <wiki> section written by renderContextPack. */
function parseCards(wiki: string): StubCard[] {
  const cards: StubCard[] = []
  let current: StubCard | null = null
  for (const line of wiki.split('\n')) {
    const card = /^\[(E\d+)\] (.+?) \(/.exec(line)
    if (card) {
      current = { ref: card[1] ?? '', names: [card[2] ?? ''], facts: [] }
      cards.push(current)
      continue
    }
    if (!current) continue
    const alias = /^- 별칭: (.+)$/.exec(line)
    if (alias) {
      current.names.push(...(alias[1] ?? '').split(', '))
      continue
    }
    const fact = /^- \[(F\d+)\]\[([^\]]+)\] (.+)$/.exec(line)
    if (fact)
      current.facts.push({ ref: fact[1] ?? '', status: fact[2] ?? '', content: fact[3] ?? '' })
  }
  return cards
}

/** The hand a fact names, if any. */
function handOf(content: string): '왼손' | '오른손' | null {
  if (content.includes('왼손')) return '왼손'
  if (content.includes('오른손')) return '오른손'
  return null
}

/** Left/right hand contradictions: a manuscript sentence about a card that uses the other hand. */
function continuityAnswer(prompt: string) {
  const manuscript = sentences(section(prompt, 'manuscript'))
  const issues = []
  for (const card of parseCards(section(prompt, 'wiki'))) {
    const about = manuscript.filter((s) => card.names.some((name) => s.includes(name)))
    for (const fact of card.facts) {
      const hand = handOf(fact.content)
      if (!hand) continue
      const other = hand === '왼손' ? '오른손' : '왼손'
      const sentence = about.find((s) => s.includes(other))
      if (!sentence) continue
      const confirmed = fact.status === '확정'
      issues.push({
        quote: sentence,
        kind: 'contradiction',
        severity: confirmed ? 'medium' : 'low',
        factRef: fact.ref,
        entryRef: card.ref,
        wikiExcerpt: fact.content,
        explanation: `위키는 ${hand}으로 설정되어 있는데 원고는 ${other}을 씁니다.`,
        suggestion: sentence.replace(other, hand),
      })
    }
  }
  return { issues }
}

/** Every chapter gets a summary, so the extraction approval dialog has something to show. */
function chapterExtractAnswer(prompt: string) {
  const first = sentences(section(prompt, 'manuscript'))[0] ?? ''
  return {
    summary: first.slice(0, 120) || '(스텁) 회차 요약',
    entries: [],
    facts: [],
    threads: [],
    relations: [],
  }
}

function interviewExtractAnswer(prompt: string) {
  const topic = /주제: (.+)/.exec(section(prompt, 'question'))?.[1]?.trim() ?? ''
  const answer = section(prompt, 'answer').trim()
  const first = sentences(answer)[0] ?? answer
  const token = stripParticle(/[가-힣]{2,}/.exec(answer)?.[0] ?? '')
  const known = listedNames(section(prompt, 'known'))
  const entries =
    (topic === '주인공' || topic === '주요 인물') && token !== '' && !known.includes(token)
      ? [{ name: token, kind: 'character', aliases: [], summary: first, fields: [] }]
      : []
  const threads =
    topic === '떡밥'
      ? [
          {
            title: Array.from(answer).slice(0, 20).join(''),
            description: answer,
            kind: 'planted',
            evidence: first,
            existingThreadRef: null,
            targetChapterPosition: null,
          },
        ]
      : []
  return {
    summary: null,
    entries,
    facts: [
      {
        subjectName: token,
        content: first,
        evidence: first,
        suggestedStatus: 'assumed',
        supersedesFactRef: null,
      },
    ],
    threads,
    relations: [],
  }
}

const QUESTION_TOPICS = ['주인공', '주요 인물', '떡밥', '세계관'] as const

/**
 * Each prompt lists the covered questions as "- [focus] topic | ..." lines inside <covered>, so the
 * question number is that count plus one. Focus alternates so both kinds show up in the E2E run.
 */
function questionAnswer(prompt: string) {
  const covered = section(prompt, 'covered')
    .split('\n')
    .filter((line) => line.startsWith('- ')).length
  const topic = QUESTION_TOPICS[covered % QUESTION_TOPICS.length] ?? QUESTION_TOPICS[0]
  const focus = covered % 2 === 0 ? 'setting' : 'story'
  return {
    focus,
    topic,
    question: `질문 (${covered + 1}): ${topic} 설정을 한 가지 더 알려 주세요.`,
    rationale: '(스텁) 아직 묻지 않은 설정을 묻습니다.',
  }
}

const REACTIONS = ['confused', 'bored', 'excited', 'dropoff', 'moved'] as const
const RATINGS = [4, 3, 5, 2] as const
const RISKS = ['low', 'medium', 'low', 'high'] as const

function readerSimAnswer(prompt: string) {
  const personaIds = section(prompt, 'personas')
    .split('\n')
    .map((line) => /^- (\S+) \(/.exec(line)?.[1])
    .filter((id): id is string => id !== undefined)
  const quotes = sentences(section(prompt, 'manuscript')).slice(0, 2)
  return {
    personas: personaIds.map((personaId, index) => ({
      personaId,
      rating: RATINGS[index % RATINGS.length],
      dropOffRisk: RISKS[index % RISKS.length],
      overall: '(스텁) 전체적으로 무난하게 읽힙니다.',
      moments: quotes.map((quote, j) => ({
        quote,
        reaction: REACTIONS[(index + j) % REACTIONS.length],
        comment: '(스텁) 이 장면의 흐름을 한 번 더 점검해 보세요.',
      })),
    })),
    summary: '(스텁) 독자 반응이 전반적으로 무난합니다.',
  }
}

function adviceAnswer(prompt: string) {
  const thread = listedNames(section(prompt, 'threads'))[0]
  const character = listedNames(section(prompt, 'characters'))[0]
  const usesThreads = thread ? [thread] : []
  const involvedCharacters = character ? [character] : []
  const option = (title: string, summary: string, beats: string[], risk: string) => ({
    title,
    summary,
    beats,
    usesThreads,
    involvedCharacters,
    risk,
  })
  return {
    options: [
      option(
        '(스텁) 정면 대결',
        '숨겨 둔 갈등을 드러내고 인물들이 정면으로 부딪힌다.',
        ['갈등이 드러난다', '인물이 선택을 강요받는다', '결과가 다음 화로 이어진다'],
        '전개가 빨라져 독자가 따라오기 어려울 수 있습니다.',
      ),
      option(
        '(스텁) 잠복과 관찰',
        '인물이 한발 물러서 상황을 살피며 단서를 모은다.',
        ['새 단서를 발견한다', '인물이 몰래 조사한다', '의외의 인물이 등장한다'],
        '긴장이 느슨해질 수 있습니다.',
      ),
      option(
        '(스텁) 뜻밖의 동행',
        '적대적이던 인물과 손을 잡고 새로운 관계를 연다.',
        ['뜻밖의 제안이 온다', '두 인물이 임시로 손을 잡는다', '서로의 비밀이 조금씩 드러난다'],
        '새 인물 필요 여부를 확인해 보세요.',
      ),
    ],
    warnings: [],
    recommendedIndex: 0,
    recommendationReason: '(스텁) 열린 떡밥을 가장 직접적으로 회수할 수 있는 방향입니다.',
  }
}

function styleAnswer(prompt: string) {
  const name = /<character>(.*?)<\/character>/.exec(prompt)?.[1] ?? '(스텁)'
  const samples = section(prompt, 'samples')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .slice(0, 3)
  return {
    name: `${name} 말투`,
    tone: '(스텁) 짧고 단호한 말투입니다.',
    rules: '- 반말을 쓴다.\n- 짧은 문장으로 끊어 말한다.',
    examples: samples.join('\n'),
  }
}
