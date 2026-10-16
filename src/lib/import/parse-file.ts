import { decodeTextFile } from '@/lib/import/decode'
import { extractDocxText } from '@/lib/import/docx'

export type ManuscriptFormat = 'txt' | 'md' | 'docx'

/** Reads an uploaded manuscript file into plain text. HWP is not supported in the MVP. */
export async function parseManuscriptFile(
  name: string,
  bytes: ArrayBuffer,
): Promise<{ text: string; encoding: string; format: ManuscriptFormat }> {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''

  if (ext === 'hwp' || ext === 'hwpx') {
    throw new Error('HWP 파일은 지원하지 않습니다. 한글에서 DOCX 또는 TXT로 저장한 뒤 올려 주세요.')
  }
  if (ext === 'txt' || ext === 'md') {
    const { text, encoding } = decodeTextFile(new Uint8Array(bytes))
    return { text, encoding, format: ext === 'md' ? 'md' : 'txt' }
  }
  if (ext === 'docx') {
    const text = await extractDocxText(bytes)
    return { text, encoding: 'utf-8', format: 'docx' }
  }
  throw new Error('지원하지 않는 파일 형식입니다. TXT, MD, DOCX 파일을 올려 주세요.')
}
