import { describe, expect, it } from 'vitest'
import { stripEndingLabel } from '@/lib/draft-plan'

describe('stripEndingLabel', () => {
  it('drops a trailing 회차 끝 line with the blank lines before it', () => {
    const text = '“…지금 누가 종 건드렸어?”\n\n회차 끝'
    expect(stripEndingLabel(text)).toBe('“…지금 누가 종 건드렸어?”')
  })

  it('strips the label with surrounding dashes and brackets', () => {
    expect(stripEndingLabel('본문이다.\n\n— 회차 끝 —')).toBe('본문이다.')
    expect(stripEndingLabel('본문이다.\n\n[Ending]')).toBe('본문이다.')
  })

  it('leaves text with other words on the last line unchanged', () => {
    expect(stripEndingLabel('회차 끝이 밋밋했다.')).toBe('회차 끝이 밋밋했다.')
  })

  it('leaves text with no label unchanged', () => {
    const text = '그는 걸었다.\n그녀는 멈췄다.'
    expect(stripEndingLabel(text)).toBe(text)
  })
})
