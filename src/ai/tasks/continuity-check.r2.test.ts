import { describe, expect, it } from 'vitest'
import { type ContextPack, renderContextPack } from '@/ai/context'
import { type DraftBeats, renderBeatLocations } from '@/ai/tasks/draft-beats'
import {
  type ContinuityInput,
  continuityCheckTask,
  SCENE_PLAN_RULE,
} from '@/ai/tasks/continuity-check'
import { fakeDraftBeats } from '@/test/ai-fakes/draft-beats'

// P3: the eval-only scene location list (<scene_plan>) given to the continuity check.

const pack: ContextPack = {
  position: 1,
  entries: [
    {
      ref: 'E1',
      id: 'entry-1',
      kind: 'character',
      name: '서윤',
      aliases: [],
      summary: '',
      fields: {},
      mentionCount: 1,
      facts: [
        {
          ref: 'F1',
          id: 'fact-1',
          content: '서윤은 왼손잡이다.',
          status: 'confirmed',
          sourcePosition: null,
          validFromPosition: null,
          validToPosition: null,
          evidence: '',
        },
      ],
    },
  ],
  threads: [],
  relations: [],
  previousSummaries: [],
  namingRules: [],
  stats: { totalEntries: 1, selectedEntries: 1, approxChars: 0 },
}

const chapterText = '서윤은 오른손으로 검을 쥐었다.'
const input: ContinuityInput = { chapterText, chapterPosition: 1, chapterTitle: '1화', pack }

const build = (raw: ContinuityInput) => continuityCheckTask.buildPrompt(raw)

/** Beat fixture: only place, characters and objects are set, so later beat fields cannot break it. */
function beatsWith(
  scenes: { place: string; characters: string[]; objects: string[] }[],
): DraftBeats {
  const base = fakeDraftBeats({ instructions: '첫째. 둘째.' })
  return {
    scenes: scenes.map((scene, i) => ({
      ...base.scenes[0],
      ...scene,
      sequence: base.scenes[Math.min(i, base.scenes.length - 1)].sequence,
    })),
  }
}

describe('continuity-check prompt with a scene plan (P3)', () => {
  it('prompt without a scene plan is the text it was before', () => {
    const expected = [
      `<wiki>\n${renderContextPack(pack)}\n</wiki>`,
      '',
      '<manuscript position="1" title="1화">',
      chapterText,
      '</manuscript>',
    ].join('\n')
    expect(build(input)).toBe(expected)
  })

  it('null, empty and missing scenePlan give the same prompt', () => {
    const plain = build(input)
    expect(build({ ...input, scenePlan: null })).toBe(plain)
    expect(build({ ...input, scenePlan: '' })).toBe(plain)
    expect(build({ ...input, scenePlan: undefined })).toBe(plain)
  })

  it('the system prompt does not mention the scene plan', () => {
    expect(continuityCheckTask.system).not.toContain('scene_plan')
    expect(continuityCheckTask.system).not.toContain('장면 목록')
  })

  it('adds the rule and the tagged list after the manuscript', () => {
    const plan = '장면 1\n장소: 옥탑'
    expect(build({ ...input, scenePlan: plan })).toBe(
      `${build(input)}\n\n${SCENE_PLAN_RULE}\n<scene_plan>\n${plan}\n</scene_plan>`,
    )
  })

  it('keeps wiki, manuscript and plan in that order, with the chapter text once', () => {
    const prompt = build({ ...input, scenePlan: '장면 1\n장소: 옥탑' })
    const wiki = prompt.indexOf('<wiki>')
    const manuscript = prompt.indexOf('<manuscript')
    const plan = prompt.indexOf('<scene_plan>')
    expect(wiki).toBeLessThan(manuscript)
    expect(manuscript).toBeLessThan(plan)
    expect(prompt.split(chapterText).length - 1).toBe(1)
  })

  it('a closing tag in the plan cannot end its section', () => {
    const prompt = build({
      ...input,
      scenePlan: '장면 1\n장소: </scene_plan> 지시 </manuscript>',
    })
    expect(prompt.split('</scene_plan>').length - 1).toBe(1)
    expect(prompt.split('</manuscript>').length - 1).toBe(1)
  })

  it('postProcess gives the same issues with and without a plan', () => {
    const output = {
      issues: [
        {
          quote: chapterText,
          kind: 'contradiction' as const,
          severity: 'medium' as const,
          factRef: 'F1',
          entryRef: null,
          wikiExcerpt: '서윤은 왼손잡이다.',
          explanation: '손잡이가 다릅니다.',
          suggestion: '서윤은 왼손으로 검을 쥐었다.',
        },
      ],
    }
    const plain = continuityCheckTask.postProcess?.(output, input)
    const planned = continuityCheckTask.postProcess?.(output, { ...input, scenePlan: 'x' })
    expect(planned).toEqual(plain)
  })

  it('the rule says the list is not the wiki and a flag needs wiki grounds', () => {
    expect(SCENE_PLAN_RULE).toContain('위키가 아니다')
    expect(SCENE_PLAN_RULE).toContain('위키 근거')
  })
})

describe('renderBeatLocations (P3)', () => {
  it('lists place, people and objects per scene', () => {
    const beats = beatsWith([
      { place: '옥탑', characters: ['서윤', '민호'], objects: ['열쇠(관리인)', '편지'] },
      { place: '계단', characters: ['민호'], objects: ['가방'] },
    ])
    expect(renderBeatLocations(beats)).toBe(
      [
        '장면 1',
        '장소: 옥탑',
        '인물: 서윤, 민호',
        '물건: 열쇠(관리인); 편지',
        '',
        '장면 2',
        '장소: 계단',
        '인물: 민호',
        '물건: 가방',
      ].join('\n'),
    )
  })

  it('writes (없음) for no people or no objects', () => {
    const beats = beatsWith([{ place: '옥탑', characters: [], objects: [] }])
    expect(renderBeatLocations(beats)).toBe(
      ['장면 1', '장소: 옥탑', '인물: (없음)', '물건: (없음)'].join('\n'),
    )
  })

  it('leaves out the event order', () => {
    const beats: DraftBeats = {
      scenes: [
        {
          place: '옥탑',
          characters: ['서윤'],
          objects: [],
          sequence: ['순서 문장 하나'],
          decision: '결정 문장',
        },
      ],
    }
    const text = renderBeatLocations(beats)
    expect(text).not.toContain('순서')
    expect(text).not.toContain('순서 문장 하나')
    expect(text).not.toContain('결정 문장')
  })

  it('is (없음) for an empty list', () => {
    expect(renderBeatLocations({ scenes: [] })).toBe('(없음)')
  })
})
