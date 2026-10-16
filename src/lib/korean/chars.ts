/**
 * Character counts for the editor. Code points, so an emoji counts as one.
 * withSpaces excludes only line breaks; withoutSpaces excludes all whitespace.
 */
export function countChars(text: string): { withSpaces: number; withoutSpaces: number } {
  let withSpaces = 0
  let withoutSpaces = 0
  for (const ch of text) {
    if (ch === '\r' || ch === '\n') continue
    withSpaces++
    if (!/\s/.test(ch)) withoutSpaces++
  }
  return { withSpaces, withoutSpaces }
}
