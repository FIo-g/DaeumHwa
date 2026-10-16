import { describe, expect, it } from 'vitest'
import { parseManuscriptFile } from '@/lib/import/parse-file'

function buf(s: string): ArrayBuffer {
  return new TextEncoder().encode(s).buffer as ArrayBuffer
}

describe('parseManuscriptFile', () => {
  it('reads a TXT file as txt', async () => {
    const r = await parseManuscriptFile('1화.txt', buf('가나다'))
    expect(r).toEqual({ text: '가나다', encoding: 'utf-8', format: 'txt' })
  })

  it('reads an MD file as md', async () => {
    const r = await parseManuscriptFile('원고.MD', buf('# 1화\n본문'))
    expect(r.format).toBe('md')
    expect(r.text).toBe('# 1화\n본문')
  })

  it('rejects HWP files with a Korean message', async () => {
    await expect(parseManuscriptFile('원고.hwp', buf(''))).rejects.toThrow(
      'HWP 파일은 지원하지 않습니다. 한글에서 DOCX 또는 TXT로 저장한 뒤 올려 주세요.',
    )
    await expect(parseManuscriptFile('원고.hwpx', buf(''))).rejects.toThrow(
      'HWP 파일은 지원하지 않습니다.',
    )
  })

  it('rejects unknown extensions', async () => {
    await expect(parseManuscriptFile('image.png', buf(''))).rejects.toThrow(
      '지원하지 않는 파일 형식입니다. TXT, MD, DOCX 파일을 올려 주세요.',
    )
  })
})
