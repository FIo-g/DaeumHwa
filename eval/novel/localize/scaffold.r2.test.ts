import { describe, expect, it } from 'vitest'
import { SCENE_PLAN_RULE, continuityCheckTask } from '@/ai/tasks/continuity-check'
import { renderBeatLocations } from '@/ai/tasks/draft-beats'
import { continuityCheckSample } from './samples/continuity-check'
import { pack } from './samples/shared'
import { findHangul, translateScaffold } from './scaffold'

// P3: the scene plan rule and the location list in English runs.

const EN_RULE =
  "The scene list below is the plan made when this manuscript was drafted. It is not the wiki. Use it only to compare each scene's place, the people there and where objects are with the wiki. Do not flag a difference between the list and the manuscript on its own. Every flag still needs wiki grounds."

const tagNames = (text: string) => [...text.matchAll(/<\/?([A-Za-z_][\w-]*)/g)].map((m) => m[1])

const englishPlan = renderBeatLocations({
  scenes: [
    {
      place: 'Harbor warehouse',
      characters: ['Mina'],
      objects: ['brass key (janitor)'],
      sequence: ['Mina enters.'],
    },
    {
      place: 'Night road',
      characters: [],
      objects: [],
      sequence: ['Mina walks home.'],
    },
  ],
})

const promptWithPlan = continuityCheckTask.buildPrompt({
  chapterText: 'Mina opened the drawer at midnight.',
  chapterPosition: 3,
  chapterTitle: 'Midnight',
  pack,
  scenePlan: englishPlan,
})

describe('scaffold for the scene plan (P3)', () => {
  it('translates the scene plan rule as one sentence', () => {
    expect(translateScaffold(SCENE_PLAN_RULE)).toBe(EN_RULE)
  })

  it('leaves no Hangul in a continuity prompt that carries a scene plan', () => {
    const translated = translateScaffold(promptWithPlan)
    expect(findHangul(translated)).toEqual([])
    expect(translated).toContain('Scene 1\nPlace: Harbor warehouse')
    expect(translated).toContain(EN_RULE)
  })

  it('keeps the XML tag names in the same order', () => {
    expect(tagNames(translateScaffold(promptWithPlan))).toEqual(tagNames(promptWithPlan))
  })

  it('the plain continuity sample still has no scene plan', () => {
    const translated = translateScaffold(continuityCheckSample)
    expect(translated).not.toContain('scene_plan')
    expect(findHangul(translated)).toEqual([])
  })
})
