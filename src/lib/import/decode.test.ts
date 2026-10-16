import { describe, expect, it } from 'vitest'
import { decodeTextFile } from '@/lib/import/decode'

describe('decodeTextFile', () => {
  it('decodes EUC-KR bytes', () => {
    const bytes = new Uint8Array([
      190, 200, 179, 231, 199, 207, 188, 188, 191, 228, 44, 32, 192, 204, 188, 173, 192, 177, 192,
      212, 180, 207, 180, 217, 46,
    ])
    expect(decodeTextFile(bytes)).toEqual({ text: '안녕하세요, 이서윤입니다.', encoding: 'euc-kr' })
  })

  it('decodes UTF-16LE with a BOM', () => {
    const bytes = new Uint8Array([255, 254, 0, 172, 152, 176])
    expect(decodeTextFile(bytes)).toEqual({ text: '가나', encoding: 'utf-16le' })
  })

  it('decodes UTF-8 and strips the BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('가나다')])
    expect(decodeTextFile(bytes)).toEqual({ text: '가나다', encoding: 'utf-8' })
  })

  it('normalizes CRLF line endings to LF', () => {
    const bytes = new TextEncoder().encode('첫 줄\r\n둘째 줄\r\n')
    expect(decodeTextFile(bytes).text).toBe('첫 줄\n둘째 줄\n')
  })
})
