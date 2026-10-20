import { describe, expect, it } from 'vitest'
import { checkDirectives, type DirectiveId, type DirectiveStatus } from './directives'

// Directive probes: each planted author request is checked on the saved chapter text (stage 0).

function statusOf(text: string, lang: 'ko' | 'en', id: DirectiveId): DirectiveStatus {
  const found = checkDirectives(text, lang).find((r) => r.id === id)
  if (!found) throw new Error(`no result for ${id}`)
  return found.status
}

describe('checkDirectives ko', () => {
  it('tic is kept when the phrase is at the end of the talk', () => {
    expect(statusOf('도윤서가 문을 열었다.\n\n"조심하십시오."', 'ko', 'tic')).toBe('kept')
  })

  it('tic is broken when the name appears without the phrase', () => {
    expect(statusOf('도윤서가 말없이 문을 닫았다.', 'ko', 'tic')).toBe('broken')
  })

  it('tic is n/a when the name does not appear', () => {
    expect(statusOf('세린은 대답하지 않았다.', 'ko', 'tic')).toBe('n/a')
  })

  it('ban-1 is kept without the banned phrase', () => {
    expect(statusOf('세린이 고개를 들었다.', 'ko', 'ban-1')).toBe('kept')
  })

  it('ban-1 is broken on the banned phrase', () => {
    expect(statusOf('세린이 고개를 끄덕였다.', 'ko', 'ban-1')).toBe('broken')
  })

  it('ban-2 is kept without the banned word', () => {
    expect(statusOf('세린이 웃었다.', 'ko', 'ban-2')).toBe('kept')
  })

  it('ban-2 is broken on the banned word', () => {
    expect(statusOf('입꼬리가 올라갔다.', 'ko', 'ban-2')).toBe('broken')
  })

  it('end-dialogue is kept when the last line is a quoted line', () => {
    expect(statusOf('세린이 문 앞에 섰다.\n\n"조심하십시오."', 'ko', 'end-dialogue')).toBe('kept')
  })

  it('end-dialogue is broken when the last line is narration', () => {
    expect(statusOf('도윤서가 웃었다.\n\n세린은 대답하지 않았다.', 'ko', 'end-dialogue')).toBe(
      'broken',
    )
  })
})

describe('checkDirectives en', () => {
  it('tic is kept when the phrase is at the end of the talk', () => {
    expect(statusOf('Yunseo smiled.\n\n"Watch your step."', 'en', 'tic')).toBe('kept')
  })

  it('tic is broken when the name appears without the phrase', () => {
    expect(statusOf('Yunseo left without a word.', 'en', 'tic')).toBe('broken')
  })

  it('tic is n/a when the name does not appear', () => {
    expect(statusOf('Serin said nothing.', 'en', 'tic')).toBe('n/a')
  })

  it('ban-1 is kept without the banned word', () => {
    expect(statusOf('Serin lifted her head.', 'en', 'ban-1')).toBe('kept')
  })

  it('ban-1 is broken on the banned word', () => {
    expect(statusOf('Serin gave a nod.', 'en', 'ban-1')).toBe('broken')
  })

  it('ban-2 is kept without the banned phrase', () => {
    expect(statusOf('Serin waited.', 'en', 'ban-2')).toBe('kept')
  })

  it('ban-2 is broken on the banned phrase', () => {
    expect(statusOf('She waited for a moment.', 'en', 'ban-2')).toBe('broken')
  })

  it('end-dialogue is kept when the last line is a quoted line', () => {
    expect(statusOf('Serin stood at the door.\n\n"Stay close."', 'en', 'end-dialogue')).toBe('kept')
  })

  it('end-dialogue is broken when the last line is narration', () => {
    expect(statusOf('"Stay close."\n\nSerin said nothing.', 'en', 'end-dialogue')).toBe('broken')
  })
})
