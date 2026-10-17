import mammoth from 'mammoth'

/**
 * Raw paragraph text of a DOCX file, one paragraph per line.
 * mammoth's browser build reads `arrayBuffer` and its Node build reads `buffer`; each ignores the
 * other key, so both are passed. The Node build accepts an ArrayBuffer under `buffer` as well.
 */
export async function extractDocxText(bytes: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({
    arrayBuffer: bytes,
    buffer: bytes as unknown as Buffer,
  })
  // mammoth ends every paragraph with a blank line ("\n\n"). Collapse those so each paragraph
  // takes one line, as TXT imports do, and drop the final line break.
  return result.value
    .replace(/\r\n?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/\n$/, '')
}
