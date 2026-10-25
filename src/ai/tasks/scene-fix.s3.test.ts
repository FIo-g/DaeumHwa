import { describe, expect, it } from 'vitest'
import {
  acceptSceneFix,
  SCENE_FIX_SYSTEM,
  sceneFixTask,
  SceneFixSchema,
  type SceneFixInput,
} from '@/ai/tasks/scene-fix'
import { SCENE_FIX_SYSTEM as EN_SCENE_FIX_SYSTEM } from '../../../eval/novel/localize/en/scene-fix'
import { findHangul } from '../../../eval/novel/localize/scaffold'
import type { DirectiveForPrompt } from '@/lib/directives'

function banRequest(pattern: string): DirectiveForPrompt {
  return {
    id: 'ban-1',
    scope: 'work',
    kind: 'ban',
    text: `'${pattern}'라는 말은 쓰지 않는다.`,
    pattern,
    speechLevel: null,
    targetChars: null,
    chapterPosition: null,
    entryId: null,
    entryName: null,
  }
}

function fullInput(): SceneFixInput {
  return {
    scene: '민준은 문을 열고 들어섰다. 방 안은 조용했다.',
    before: '민준은 복도를 걸었다.\n민준은 문 앞에 섰다.',
    after: '지수는 창밖을 보았다.',
    reasons: [{ label: '요청과 다름', note: '요청한 사건이 빠졌다.' }],
    planScene: '민준이 방에 들어간다.',
    requests: [
      {
        id: 'style-1',
        scope: 'work',
        kind: 'style',
        text: '짧은 문장으로 쓴다.',
        pattern: null,
        speechLevel: null,
        targetChars: null,
        chapterPosition: null,
        entryId: null,
        entryName: null,
      },
    ],
    styleCards: [],
  }
}

describe('sceneFixTask.buildPrompt', () => {
  it('holds the tags in order', () => {
    const prompt = sceneFixTask.buildPrompt(fullInput())
    const order = [
      '<author_requests>',
      '<style_cards>',
      '<plan_scene>',
      '<before>',
      '<scene>',
      '<after>',
      '<problems>',
    ]
    const positions = order.map((tag) => prompt.indexOf(tag))
    expect(positions.every((pos) => pos !== -1)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('writes (없음) for a first scene before text', () => {
    const prompt = sceneFixTask.buildPrompt({ ...fullInput(), before: '' })
    expect(prompt).toContain('<before>\n(없음)\n</before>')
  })

  it('omits the optional blocks when not given', () => {
    const prompt = sceneFixTask.buildPrompt({
      ...fullInput(),
      requests: [],
      planScene: null,
    })
    expect(prompt).not.toContain('<author_requests>')
    expect(prompt).not.toContain('<plan_scene>')
    expect(prompt).toContain('<style_cards>')
    expect(prompt).toContain('<problems>')
  })
})

describe('sceneFixTask definition', () => {
  it('runs at medium effort with 6000 max tokens', () => {
    expect(sceneFixTask.name).toBe('scene-fix')
    expect(sceneFixTask.effort).toBe('medium')
    expect(sceneFixTask.maxTokens).toBe(6000)
  })

  it('accepts a fixed scene text', () => {
    expect(SceneFixSchema.parse({ text: '민준은 문을 열었다.' })).toEqual({
      text: '민준은 문을 열었다.',
    })
  })
})

describe('acceptSceneFix', () => {
  const original = '민준은 문을 열고 들어섰다. 방 안은 조용했고 창문이 열려 있었다.'

  it('rejects a fix with a scene break line', () => {
    expect(acceptSceneFix(original, `${original}\n\n***\n\n민준은 창문을 닫았다.`, [])).toBe(false)
  })

  it('rejects a fix at 60% of the original length', () => {
    const fixed = original.slice(0, Math.floor(original.length * 0.6))
    expect(fixed.length).toBeGreaterThan(0)
    expect(acceptSceneFix(original, fixed, [])).toBe(false)
  })

  it('rejects a fix that adds a banned phrase', () => {
    const requests = [banRequest('입꼬리')]
    const fixed = `${original} 민준의 입꼬리가 올라갔다.`
    expect(acceptSceneFix(original, fixed, requests)).toBe(false)
  })

  it('accepts a fix at full length with the same ban hits', () => {
    const withBan = `${original} 민준의 입꼬리가 올라갔다.`
    const fixed = `${original} 민준의 입꼬리가 올라갔다!`
    expect(acceptSceneFix(withBan, fixed, [banRequest('입꼬리')])).toBe(true)
  })
})

describe('scene-fix English localization', () => {
  it('leaves no Hangul', () => {
    expect(findHangul(EN_SCENE_FIX_SYSTEM)).toEqual([])
    expect(findHangul(SCENE_FIX_SYSTEM)).not.toEqual([])
  })
})
