import { describe, expect, it } from 'vitest'
import { isVagueRequest } from '@/lib/edit-hunks'

// Task 1 review: 잘 only marks a vague request as its own word, not inside 잘라, 잘게 or 잘못.
describe('isVagueRequest word boundary (s4)', () => {
  it('keeps a concrete request that contains 잘 inside another word', () => {
    expect(isVagueRequest('문단을 짧게 잘라 쓴다', [])).toBe(false)
  })

  it('still treats a standalone 잘 as vague', () => {
    expect(isVagueRequest('대사를 잘 쓴다', [])).toBe(true)
  })
})
