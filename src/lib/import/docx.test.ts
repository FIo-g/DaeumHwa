import { zipSync, strToU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { extractDocxText } from '@/lib/import/docx'

function makeDocx(paragraphs: string[]): ArrayBuffer {
  const body = paragraphs
    .map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`)
    .join('')
  const zipped = zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    'word/document.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
    ),
  })
  const copy = new Uint8Array(zipped.byteLength)
  copy.set(zipped)
  return copy.buffer
}

describe('extractDocxText', () => {
  it('returns the raw text of each paragraph on its own line', async () => {
    const text = await extractDocxText(makeDocx(['첫 문단입니다.', '둘째 문단입니다.']))
    expect(text.split('\n').filter(Boolean)).toEqual(['첫 문단입니다.', '둘째 문단입니다.'])
  })

  it('keeps one line break per paragraph, like TXT imports', async () => {
    const text = await extractDocxText(makeDocx(['첫 문단입니다.', '둘째 문단입니다.', '셋째.']))
    expect(text).toBe('첫 문단입니다.\n둘째 문단입니다.\n셋째.')
  })
})
