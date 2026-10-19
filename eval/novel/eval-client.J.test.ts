import { describe, expect, it } from 'vitest'
import { EN_SYSTEMS } from './localize/en-systems'

// English proofread scope rules for the eval client (track J). The mirror of
// src/ai/tasks/proofread.ts; kept apart from eval-client.test.ts (spec 5).
describe('English proofread system', () => {
  it('carries the scope rules', () => {
    const system = EN_SYSTEMS.proofread
    expect(system).toContain('Fix only violations of standard language norms.')
    expect(system).toContain('return an empty suggestions array')
    expect(system).not.toMatch(/[가-힣]/)
  })
})
