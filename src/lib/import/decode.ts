export type TextEncodingName = 'utf-8' | 'utf-16le' | 'utf-16be' | 'euc-kr'

/**
 * Decodes a manuscript file: BOM first, then strict UTF-8, then EUC-KR (the legacy Korean
 * encoding still produced by some editors). Line endings are normalized to LF.
 */
export function decodeTextFile(bytes: Uint8Array): { text: string; encoding: TextEncodingName } {
  let text: string
  let encoding: TextEncodingName

  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    encoding = 'utf-16le'
    text = new TextDecoder('utf-16le').decode(bytes.subarray(2))
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    encoding = 'utf-16be'
    text = new TextDecoder('utf-16be').decode(bytes.subarray(2))
  } else if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    encoding = 'utf-8'
    text = new TextDecoder('utf-8').decode(bytes.subarray(3))
  } else {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      encoding = 'utf-8'
    } catch {
      encoding = 'euc-kr'
      text = new TextDecoder('euc-kr').decode(bytes)
    }
  }

  return { text: text.replace(/\r\n?/g, '\n'), encoding }
}
