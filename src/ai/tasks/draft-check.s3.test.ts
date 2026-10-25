import { describe, expect, it } from 'vitest'
import {
  DRAFT_CHECK_SYSTEM,
  draftCheckTask,
  DraftCheckSchema,
  numberScenes,
  type DraftCheckInput,
} from '@/ai/tasks/draft-check'
import type { DirectiveForPrompt } from '@/lib/directives'
import { sceneSpans } from '@/lib/scene'

function directive(
  id: string,
  kind: DirectiveForPrompt['kind'],
  text: string,
  extra: Partial<DirectiveForPrompt> = {},
): DirectiveForPrompt {
  return {
    id,
    scope: 'work',
    kind,
    text,
    pattern: kind === 'ban' ? text : null,
    speechLevel: null,
    targetChars: null,
    chapterPosition: null,
    entryId: null,
    entryName: null,
    ...extra,
  }
}

const TEXT = ['민준은 문을 열었다.', '***', '지수는 창밖을 보았다.', '***', '문이 닫혔다.'].join(
  '\n',
)

function numberedText(): string {
  return numberScenes(TEXT, sceneSpans(TEXT, 3))
}

function fullInput(): DraftCheckInput {
  return {
    numbered: numberedText(),
    sceneCount: 3,
    plan: '작가 메모: (없음)\n장면 1 (도입, 공백 포함 약 1,000자)\n- 일어나는 일: 민준이 문을 연다.',
    instructions: '민준이 문을 열고 들어간다.',
    requests: [
      directive('style-1', 'style', '짧은 문장으로 쓴다.'),
      directive('content-1', 'content', '열쇠가 나온다.'),
    ],
    hiddenFacts: ['문 뒤에 세린이 있다.'],
  }
}

describe('numberScenes', () => {
  it('prefixes each span with [장면 N] and drops break lines', () => {
    const numbered = numberedText()
    expect(numbered).toContain('[장면 1]')
    expect(numbered).toContain('[장면 2]')
    expect(numbered).toContain('[장면 3]')
    expect(numbered).not.toContain('***')
  })
})

describe('draftCheckTask.buildPrompt', () => {
  it('holds the numbered draft', () => {
    const prompt = draftCheckTask.buildPrompt(fullInput())
    expect(prompt).toContain('[장면 1]')
    expect(prompt).toContain('[장면 3]')
    expect(prompt).not.toContain('***')
  })

  it('renders the optional blocks in order when given', () => {
    const prompt = draftCheckTask.buildPrompt(fullInput())
    const order = ['<draft>', '<instructions>', '<plan>', '<author_requests>', '<hidden_facts>']
    const positions = order.map((tag) => prompt.indexOf(tag))
    expect(positions.every((pos) => pos !== -1)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('omits the optional blocks when not given', () => {
    const prompt = draftCheckTask.buildPrompt({
      numbered: numberedText(),
      sceneCount: 3,
      plan: null,
      instructions: null,
      requests: [],
      hiddenFacts: [],
    })
    expect(prompt).toContain('<draft>')
    expect(prompt).not.toContain('<instructions>')
    expect(prompt).not.toContain('<plan>')
    expect(prompt).not.toContain('<author_requests>')
    expect(prompt).not.toContain('<hidden_facts>')
  })

  it('leaves ban and speech requests out of the check prompt', () => {
    const prompt = draftCheckTask.buildPrompt({
      ...fullInput(),
      requests: [
        directive('style-1', 'style', '짧은 문장으로 쓴다.'),
        directive('content-1', 'content', '열쇠가 나온다.'),
        directive('ban-1', 'ban', '입꼬리', { pattern: '입꼬리' }),
        directive('speech-1', 'speech', '세린은 반말을 쓴다.', {
          entryId: 'e1',
          entryName: '세린',
          speechLevel: 'banmal',
        }),
      ],
    })
    expect(prompt).toContain('짧은 문장으로 쓴다.')
    expect(prompt).toContain('열쇠가 나온다.')
    expect(prompt).not.toContain('입꼬리')
    expect(prompt).not.toContain('세린은 반말을 쓴다.')
  })
})

describe('DRAFT_CHECK_SYSTEM', () => {
  it('names the missing-event check', () => {
    expect(DRAFT_CHECK_SYSTEM).toContain('missing-event')
  })

  it('holds every check code', () => {
    for (const code of [
      'missing-event',
      'skipped-moment',
      'unmotivated-feeling',
      'repeated-beat',
      'flat-ending',
      'request',
      'leak',
    ]) {
      expect(DRAFT_CHECK_SYSTEM).toContain(code)
    }
  })
})

describe('draftCheckTask definition', () => {
  it('runs cheap', () => {
    expect(draftCheckTask.name).toBe('draft-check')
    expect(draftCheckTask.effort).toBe('low')
    expect(draftCheckTask.maxTokens).toBe(2000)
  })

  it('accepts a valid check and rejects a note over 80 characters', () => {
    expect(
      DraftCheckSchema.parse({
        scenes: [
          { scene: 1, reasons: [{ code: 'missing-event', note: '열쇠를 받는 일이 없다.' }] },
        ],
      }),
    ).toBeDefined()
    expect(() =>
      DraftCheckSchema.parse({
        scenes: [{ scene: 1, reasons: [{ code: 'missing-event', note: '가'.repeat(81) }] }],
      }),
    ).toThrow()
  })
})

describe('draftCheckTask.postProcess', () => {
  const input = fullInput()

  it('drops a scene out of range', () => {
    const output = draftCheckTask.postProcess!(
      {
        scenes: [
          { scene: 5, reasons: [{ code: 'missing-event', note: '열쇠를 받는 일이 없다.' }] },
        ],
      },
      input,
    )
    expect(output).toEqual({ scenes: [] })
  })

  it('drops scenes with empty reason lists', () => {
    const output = draftCheckTask.postProcess!(
      {
        scenes: [
          { scene: 1, reasons: [] },
          { scene: 2, reasons: [{ code: 'request', note: '요청과 다름.' }] },
        ],
      },
      input,
    )
    expect(output.scenes.map((scene) => scene.scene)).toEqual([2])
  })

  it('keeps 4 of 6 scenes', () => {
    const output = draftCheckTask.postProcess!(
      {
        scenes: [1, 2, 3, 4, 5, 6].map((scene) => ({
          scene,
          reasons: [{ code: 'repeated-beat' as const, note: '같은 흐름이 반복된다.' }],
        })),
      },
      { ...input, sceneCount: 6 },
    )
    expect(output.scenes.map((scene) => scene.scene)).toEqual([1, 2, 3, 4])
  })
})
