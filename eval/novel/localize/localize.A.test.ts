import { describe, expect, it } from 'vitest'
import { EN_SYSTEMS } from './en-systems'
import { draftContinueSample } from './samples/draft-continue'
import { translateScaffold } from './scaffold'

// Brief A: the continuation prompt is translated with its own rules, in the right order, and the
// English draft system carries the new length and continuation rules.
describe('English draft continuation (brief A)', () => {
  it('translates the continuation length line with the "written so far" rule', () => {
    const translated = translateScaffold(draftContinueSample)
    expect(translated).toMatch(
      /<continue_length>Written so far: \d+ characters\. Continue with at least \d+ and at most \d+ characters including spaces\.<\/continue_length>/,
    )
  })

  it('translates the target and scene budget lines', () => {
    const translated = translateScaffold(draftContinueSample)
    expect(translated).toMatch(
      /<target_length>at least \d+ and at most \d+ characters including spaces<\/target_length>/,
    )
    expect(translated).toMatch(
      /<scene_budget>\d+ scenes, about \d+ characters per scene including spaces<\/scene_budget>/,
    )
  })

  it('keeps the draft so far inside its tags', () => {
    expect(draftContinueSample).toContain('<draft_so_far>\nMina opened the door.\n</draft_so_far>')
  })

  it('tells the English draft system about the minimum, the scene budget and the continuation', () => {
    const system = EN_SYSTEMS['draft-chapter']
    expect(system).toContain('at least the minimum length in <target_length>')
    expect(system).toContain('<scene_budget>')
    expect(system).toContain('<draft_so_far>')
    expect(system).toContain('<continue_length>')
    expect(system).not.toContain('Aim close to the target length.')
  })
})
