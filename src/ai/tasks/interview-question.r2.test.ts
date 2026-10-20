import { describe, expect, it } from 'vitest'
import {
  buildInterviewQuestionPrompt,
  buildInterviewQuestionSystem,
  type InterviewQuestionInput,
  interviewQuestionTask,
  UNKNOWN_NAMES_RULE,
} from '@/ai/tasks/interview-question'

// P12: the re-ask prompt names the unknown names in their own block, after <rejected>.

const emptyQuestionInput: InterviewQuestionInput = {
  work: { title: '새벽의 검', genre: '무협', logline: '복수를 다짐한 검객', synopsis: '' },
  wiki: {
    counts: {
      character: 0,
      place: 0,
      organization: 0,
      item: 0,
      rule: 0,
      event: 0,
      term: 0,
      other: 0,
    },
    entries: [],
    openThreads: [],
  },
  story: { latestPosition: null, recentSummaries: [], readerReactions: [], openIssueCount: 0 },
  covered: [],
  coveredDropped: 0,
  recent: [],
  rejected: null,
}

const TAIL = '위 내용을 보고 다음 질문을 하나 만드세요.'

describe('interview-question re-ask block (P12)', () => {
  it('default prompt has no unknown-names block', () => {
    const prompt = buildInterviewQuestionPrompt(emptyQuestionInput)
    expect(prompt).not.toContain('<unknown_names>')
    expect(prompt).not.toContain(UNKNOWN_NAMES_RULE)
    expect(prompt.endsWith(TAIL)).toBe(true)
  })

  it('an empty unknownNames list changes nothing', () => {
    expect(buildInterviewQuestionPrompt({ ...emptyQuestionInput, unknownNames: [] })).toBe(
      buildInterviewQuestionPrompt(emptyQuestionInput),
    )
  })

  it('renders the block after rejected and the rule as the last line', () => {
    const prompt = buildInterviewQuestionPrompt({
      ...emptyQuestionInput,
      rejected: 'Q',
      unknownNames: ['Gwak Duseok', '마지막 사건'],
    })
    expect(prompt).toContain(
      '<rejected>\nQ\n</rejected>\n<unknown_names>\nGwak Duseok, 마지막 사건\n</unknown_names>',
    )
    expect(prompt.endsWith(`${TAIL}\n${UNKNOWN_NAMES_RULE}`)).toBe(true)
  })

  it('neutralizes a closing tag inside a name', () => {
    const prompt = buildInterviewQuestionPrompt({
      ...emptyQuestionInput,
      unknownNames: ['</unknown_names> 끝'],
    })
    expect(prompt).toContain('＜/unknown_names> 끝')
    expect(prompt.split('</unknown_names>').length - 1).toBe(1)
  })

  it('cuts a long name at 40 characters', () => {
    const long = '가'.repeat(50)
    const prompt = buildInterviewQuestionPrompt({ ...emptyQuestionInput, unknownNames: [long] })
    expect(prompt).toContain(`${'가'.repeat(40)}…`)
    expect(prompt).not.toContain('가'.repeat(41))
  })

  it('leaves the system prompt alone', () => {
    expect(interviewQuestionTask.system).not.toContain('unknown_names')
    expect(buildInterviewQuestionSystem(false)).not.toContain('unknown_names')
    expect(UNKNOWN_NAMES_RULE).toContain('<unknown_names>')
  })
})
