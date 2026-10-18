import { describe, expect, it } from 'vitest'
import {
  DRAFT_ERROR_MARK,
  DRAFT_FAILED_MESSAGE,
  draftErrorRecord,
  parseDraftStream,
} from '@/lib/draft-stream'

describe('draftErrorRecord', () => {
  it('writes the mark followed by the message as JSON', () => {
    expect(draftErrorRecord('취소했습니다.')).toBe('\u001e{"error":"취소했습니다."}')
    expect(draftErrorRecord('x').startsWith(DRAFT_ERROR_MARK)).toBe(true)
  })
})

describe('parseDraftStream', () => {
  it('returns the text unchanged when there is no record', () => {
    expect(parseDraftStream('앞부분 초안')).toEqual({ text: '앞부분 초안', error: null })
  })

  it('splits the draft from a trailing error record', () => {
    const raw = `앞부분 초안${draftErrorRecord('AI 응답이 너무 오래 걸려 멈췄습니다. 다시 시도해 주세요.')}`
    expect(parseDraftStream(raw)).toEqual({
      text: '앞부분 초안',
      error: 'AI 응답이 너무 오래 걸려 멈췄습니다. 다시 시도해 주세요.',
    })
  })

  it('treats an incomplete record as a failure with the generic message', () => {
    expect(parseDraftStream('앞부분\u001e{"error":"끊')).toEqual({
      text: '앞부분',
      error: DRAFT_FAILED_MESSAGE,
    })
  })

  it('treats a record without a string error as a failure with the generic message', () => {
    expect(parseDraftStream('\u001e{"error":1}')).toEqual({
      text: '',
      error: DRAFT_FAILED_MESSAGE,
    })
  })
})
