import { describe, expect, it } from 'vitest'
import { codeSceneFindings, pickScenes, type SceneFinding } from '@/lib/draft-check'
import { textLang } from '@/lib/korean/cliches'
import { sceneSpans } from '@/lib/scene'
import type { DirectiveForPrompt } from '@/lib/directives'
import type { DraftPlanCard } from '@/lib/draft-plan'

function banRequest(pattern: string): DirectiveForPrompt {
  return {
    id: 'ban-1',
    scope: 'work',
    kind: 'ban',
    text: `'${pattern}'는 쓰지 않는다.`,
    pattern,
    speechLevel: null,
    targetChars: null,
    chapterPosition: null,
    entryId: null,
    entryName: null,
  }
}

function cardWithTargets(targets: number[]): DraftPlanCard {
  return {
    scenes: targets.map((targetChars, i) => ({
      summary: `장면 ${i + 1} 요약`,
      goal: `장면 ${i + 1} 목표`,
      decision: '',
      stake: '',
      trigger: '',
      role: i === targets.length - 1 ? ('ending' as const) : ('turn' as const),
      place: '집',
      characters: [],
      targetChars,
    })),
    ending: { device: 'question', line: '끝 문장' },
    threads: [],
    requests: [],
  }
}

const NO_REQUESTS: DirectiveForPrompt[] = []
const NO_NAMES: Record<string, string[]> = {}

describe('codeSceneFindings: cliche', () => {
  it('gives nothing for one cliche and one finding for two', () => {
    const one = ['민준은 고개를 끄덕였다.', '지수는 창밖을 보며 차를 마셨다.'].join('\n')
    const oneFindings = codeSceneFindings(one, {
      spans: sceneSpans(one, 1),
      requests: NO_REQUESTS,
      names: NO_NAMES,
      card: null,
    })
    expect(oneFindings.filter((f) => f.reason === 'cliche')).toEqual([])

    const two = ['민준은 고개를 끄덕였다.', '지수는 입꼬리가 올라가며 웃었다.'].join('\n')
    const twoFindings = codeSceneFindings(two, {
      spans: sceneSpans(two, 1),
      requests: NO_REQUESTS,
      names: NO_NAMES,
      card: null,
    })
    const cliches = twoFindings.filter((f) => f.reason === 'cliche')
    expect(cliches).toHaveLength(1)
    expect(cliches[0].scene).toBe(1)
    expect(cliches[0].note).toContain('고개를 끄덕')
    expect(cliches[0].note).toContain('입꼬리가 올라')
  })

  it('counts 고개를 한 번 끄덕였다 as a cliche hit', () => {
    const text = ['그는 고개를 한 번 끄덕였다.', '그녀는 입꼬리가 올라가며 웃었다.'].join('\n')
    const findings = codeSceneFindings(text, {
      spans: sceneSpans(text, 1),
      requests: NO_REQUESTS,
      names: NO_NAMES,
      card: null,
    })
    const cliches = findings.filter((f) => f.reason === 'cliche')
    expect(cliches).toHaveLength(1)
    expect(cliches[0].note).toContain('고개를 끄덕')
  })
})

describe('codeSceneFindings: repeat', () => {
  const sceneWith = (other: string, closer: string) =>
    `${other}\n바람이 창문을 두드렸다.\n${closer}`

  it('gives nothing when a 3-gram is seen twice', () => {
    const text = [
      sceneWith('민준은 아침에 일어났다.', '그는 커피를 내렸다.'),
      sceneWith('지수는 저녁에 퇴근했다.', '그녀는 불을 켰다.'),
    ].join('\n***\n')
    const findings = codeSceneFindings(text, {
      spans: sceneSpans(text, 2),
      requests: NO_REQUESTS,
      names: NO_NAMES,
      card: null,
    })
    expect(findings.filter((f) => f.reason === 'repeat')).toEqual([])
  })

  it('gives findings in the scenes of the 2nd and 3rd occurrence', () => {
    const text = [
      sceneWith('민준은 아침에 일어났다.', '그는 커피를 내렸다.'),
      sceneWith('지수는 저녁에 퇴근했다.', '그녀는 불을 켰다.'),
      sceneWith('하늘은 점차 어두워졌다.', '아이들은 집으로 돌아갔다.'),
    ].join('\n***\n')
    const findings = codeSceneFindings(text, {
      spans: sceneSpans(text, 3),
      requests: NO_REQUESTS,
      names: NO_NAMES,
      card: null,
    })
    const repeats = findings.filter((f) => f.reason === 'repeat')
    expect(repeats.map((f) => f.scene).sort()).toEqual([2, 3])
    expect(repeats[0].note).toBe('바람이 창문을 두드렸다')
  })

  it('keeps at most 3 repeat findings per scene, the most repeated ones', () => {
    const grams = [
      { phrase: 'alpha beta gamma', count: 6 },
      { phrase: 'delta epsilon zeta', count: 5 },
      { phrase: 'theta iota kappa', count: 4 },
      { phrase: 'lambda mu nu', count: 3 },
      { phrase: 'omicron pi rho', count: 3 },
    ]
    let filler = 0
    const parts: string[] = []
    for (const gram of grams) {
      for (let i = 0; i < gram.count; i++) {
        parts.push(gram.phrase)
        filler += 1
        parts.push(`uq${filler}`)
      }
    }
    const text = parts.join(' ')
    const findings = codeSceneFindings(text, {
      spans: sceneSpans(text, 1),
      requests: NO_REQUESTS,
      names: NO_NAMES,
      card: null,
    })
    const repeats = findings.filter((f) => f.reason === 'repeat')
    expect(repeats).toHaveLength(3)
    expect(repeats.map((f) => f.note).sort()).toEqual(
      ['alpha beta gamma', 'delta epsilon zeta', 'theta iota kappa'].sort(),
    )
  })
})

describe('codeSceneFindings: scene-length', () => {
  it('flags a 500-character scene against a 1000 target', () => {
    const scene1 = '나'.repeat(1000)
    const scene2 = '가'.repeat(500)
    const text = `${scene1}\n***\n${scene2}`
    const findings = codeSceneFindings(text, {
      spans: sceneSpans(text, 2),
      requests: NO_REQUESTS,
      names: NO_NAMES,
      card: cardWithTargets([1000, 1000]),
    })
    const lengths = findings.filter((f) => f.reason === 'scene-length')
    expect(lengths).toHaveLength(1)
    expect(lengths[0].scene).toBe(2)
    expect(lengths[0].note).toBe('500/1000자')
  })
})

describe('codeSceneFindings: summary-ending', () => {
  it('flags a summary-like last paragraph', () => {
    const text = ['민준은 문을 열고 들어섰다.', '결국 그렇게 모든 것이 시작이었다.'].join('\n')
    const findings = codeSceneFindings(text, {
      spans: sceneSpans(text, 1),
      requests: NO_REQUESTS,
      names: NO_NAMES,
      card: null,
    })
    const endings = findings.filter((f) => f.reason === 'summary-ending')
    expect(endings).toHaveLength(1)
    expect(endings[0].scene).toBe(1)
  })

  it('gives nothing when the last line is dialogue', () => {
    const text = ['민준은 문을 열고 들어섰다.', '"내일 다시 만나자."'].join('\n')
    const findings = codeSceneFindings(text, {
      spans: sceneSpans(text, 1),
      requests: NO_REQUESTS,
      names: NO_NAMES,
      card: null,
    })
    expect(findings.filter((f) => f.reason === 'summary-ending')).toEqual([])
  })
})

describe('codeSceneFindings: request', () => {
  it('flags the scene holding a banned English phrase (the M2 English case)', () => {
    const text = [
      'The morning was quiet and cold.',
      '***',
      'She stopped for a moment and listened.',
    ].join('\n')
    const findings = codeSceneFindings(text, {
      spans: sceneSpans(text, 2),
      requests: [banRequest('for a moment')],
      names: NO_NAMES,
      card: null,
    })
    const requests = findings.filter((f) => f.reason === 'request')
    expect(requests).toHaveLength(1)
    expect(requests[0].scene).toBe(2)
    expect(requests[0].note).toBe("'for a moment'")
  })
})

describe('pickScenes', () => {
  const finding = (scene: number, reason: SceneFinding['reason']): SceneFinding => ({
    scene,
    reason,
    note: 'note',
  })

  it('puts a missing-event scene before a request scene', () => {
    expect(pickScenes([finding(2, 'request'), finding(1, 'missing-event')])).toEqual([1, 2])
  })

  it('puts a request scene before a skipped-moment scene', () => {
    expect(pickScenes([finding(1, 'skipped-moment'), finding(2, 'request')])).toEqual([2, 1])
  })

  it('returns [] for only cliche and repeat findings', () => {
    expect(pickScenes([finding(1, 'cliche'), finding(2, 'repeat')])).toEqual([])
  })
})

describe('textLang', () => {
  it('reads English prose as en', () => {
    expect(textLang('The wind knocked on the window. She stopped and listened quietly.')).toBe('en')
  })
})
