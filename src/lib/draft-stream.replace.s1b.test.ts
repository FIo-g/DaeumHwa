import { describe, expect, it } from 'vitest'
import {
  DRAFT_ERROR_MARK,
  DRAFT_REPLACE_MARK,
  draftErrorRecord,
  draftReplaceRecord,
  parseDraftStream,
} from '@/lib/draft-stream'

describe('draftReplaceRecord', () => {
  it('writes the mark, the text as JSON, and a closing mark', () => {
    expect(draftReplaceRecord('바뀐 글')).toBe(
      `${DRAFT_REPLACE_MARK}{"text":"바뀐 글"}${DRAFT_REPLACE_MARK}`,
    )
  })
})

describe('parseDraftStream with a replace record', () => {
  it('gives the replaced text', () => {
    expect(parseDraftStream('첫 글' + draftReplaceRecord('바뀐 글'))).toEqual({
      text: '바뀐 글',
      error: null,
    })
  })

  it('gives the first text while the replace record is incomplete', () => {
    expect(parseDraftStream(`첫 글${DRAFT_REPLACE_MARK}{"text":"바뀐`)).toEqual({
      text: '첫 글',
      error: null,
    })
  })

  it('gives the replaced text with the error after a replace record', () => {
    const raw = `첫 글${draftReplaceRecord('바뀐 글')}${draftErrorRecord('끊겼습니다.')}`
    expect(parseDraftStream(raw)).toEqual({ text: '바뀐 글', error: '끊겼습니다.' })
  })

  it('gives the last of two replace records', () => {
    const raw = `첫 글${draftReplaceRecord('둘째 글')}${draftReplaceRecord('셋째 글')}`
    expect(parseDraftStream(raw)).toEqual({ text: '셋째 글', error: null })
  })

  it('keeps the text around a replace record that is not the last thing', () => {
    expect(parseDraftStream(`첫 글${draftReplaceRecord('바뀐 글')}뒤`)).toEqual({
      text: '바뀐 글',
      error: null,
    })
  })

  it('never shows the error mark or the replace mark as text', () => {
    const raw = `첫 글${DRAFT_REPLACE_MARK}{"text":"x"}${DRAFT_REPLACE_MARK}`
    expect(parseDraftStream(raw).text.includes(DRAFT_REPLACE_MARK)).toBe(false)
    expect(parseDraftStream(raw).text.includes(DRAFT_ERROR_MARK)).toBe(false)
  })
})
