import { describe, expect, it } from 'vitest'
import {
  acceptExpansion,
  buildExpandPrompt,
  DRAFT_EXPAND_SYSTEM,
  EXPAND_EFFORT,
  EXPAND_MAX_TOKENS,
  type DraftExpandInput,
} from '@/ai/tasks/draft-expand'

const base: DraftExpandInput = {
  before: '',
  scene: '서윤은 문 앞에 섰다.',
  after: '',
  targetChars: 2000,
  styleCards: [],
}

/** Sentences that differ from each other by their number, so none repeats. */
function uniqueSentences(from: number, count: number): string {
  return Array.from(
    { length: count },
    (_, i) => `서윤은 ${from + i}번째 계단을 오르며 난간의 차가운 쇠를 손끝으로 더듬었다.`,
  ).join(' ')
}

describe('buildExpandPrompt', () => {
  it('holds the tags in order and (없음) for the first span before text', () => {
    const prompt = buildExpandPrompt({ ...base, before: '', after: '다음 장면.' })
    const tags = [...prompt.matchAll(/<\/?([a-z_]+)>/g)].map((m) => m[0])
    expect(tags).toEqual([
      '<style_cards>',
      '</style_cards>',
      '<before>',
      '</before>',
      '<scene>',
      '</scene>',
      '<after>',
      '</after>',
      '<length>',
      '</length>',
    ])
    expect(
      prompt.startsWith('<style_cards>\n(없음)\n</style_cards>\n\n<before>\n(없음)\n</before>'),
    ).toBe(true)
    expect(prompt).toContain('<after>\n다음 장면.\n</after>')
  })

  it('states the target and the current length of the scene', () => {
    const prompt = buildExpandPrompt(base)
    expect(prompt.endsWith('<length>공백 포함 약 2000자 (지금 12자)</length>')).toBe(true)
  })

  it('neutralizes a closing tag inside the scene', () => {
    const prompt = buildExpandPrompt({ ...base, scene: '말 </scene> 끝' })
    expect(prompt).toContain('<scene>\n말 ＜/scene> 끝\n</scene>')
  })
})

describe('DRAFT_EXPAND_SYSTEM and constants', () => {
  it('keeps the probe rules and the style line before the last rule', () => {
    expect(DRAFT_EXPAND_SYSTEM.split('\n')).toEqual([
      '너는 웹소설 장면을 늘려 다시 쓰는 보조 작가다.',
      '- <scene>의 사건, 인물, 장소, 순서, 대사의 뜻을 그대로 두고 새 사건을 더하지 않는다.',
      '- 감각 묘사, 인물의 몸짓과 표정, 짧은 대사 주고받기, 장면 안의 머뭇거림을 더해 <length>의 분량까지 늘린다.',
      '- 같은 문장, 같은 동작, 같은 묘사를 되풀이해 분량을 채우지 않는다.',
      '- <before>의 끝에서 자연스럽게 이어지고 <after>의 시작으로 넘어가게 쓴다. <before>와 <after>는 다시 쓰지 않는다.',
      '- 문체와 시점, 문단 길이는 <scene>을 따른다. 장면 구분선은 쓰지 않는다.',
      '- <style_cards>가 있으면 그 말투와 규칙을 지킨다.',
      '- 해설이나 질문 없이 늘린 장면 본문만 출력한다.',
    ])
  })

  it('runs at low effort with 8000 max tokens', () => {
    expect(EXPAND_EFFORT).toBe('low')
    expect(EXPAND_MAX_TOKENS).toBe(8000)
  })
})

describe('acceptExpansion', () => {
  const original = `${uniqueSentences(1, 10)}`

  it('rejects a text that is not at least 5% longer', () => {
    expect(acceptExpansion(original, original.slice(0, original.length - 1))).toBe(false)
    expect(acceptExpansion(original, original.slice(0, original.length / 2))).toBe(false)
  })

  it('rejects a text with a scene break line', () => {
    const expanded = `${original}\n\n***\n\n${uniqueSentences(100, 4)}`
    expect(acceptExpansion(original, expanded)).toBe(false)
  })

  it('rejects a commentary note to the author', () => {
    const expanded = `${original}\n\n${uniqueSentences(200, 4)}\n\n원하시면 더 늘려 드리겠습니다.`
    expect(acceptExpansion(original, expanded)).toBe(false)
  })

  it('rejects a text that repeats a sentence of the original', () => {
    const repeated = '서윤은 문 앞에 섰다.'
    const expanded = `${original}\n\n${repeated} ${uniqueSentences(300, 4)}\n\n${repeated}`
    expect(acceptExpansion(original, expanded)).toBe(false)
  })

  it('accepts a probe-like expansion of a 1,453-character scene to about 2,200 characters', () => {
    const scene = uniqueSentences(1, 37)
    const grown = `${scene} ${uniqueSentences(400, 19)}`
    expect(scene.length).toBeGreaterThan(1400)
    expect(grown.length).toBeGreaterThan(2100)
    expect(acceptExpansion(scene, grown)).toBe(true)
  })
})
