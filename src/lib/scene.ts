// Scene ranges for the scene rewrite (spec 7, brief D). A chapter with scene break lines is split
// at those lines. A chapter without them is cut into a window of paragraphs around the quote.
// Pure functions: no DB, no AI.

import { splitParagraphs } from '@/lib/korean/paragraphs'

export type SceneRange = { start: number; end: number }

/** Paragraphs taken on each side of the quoted paragraph when the text has no break line. */
export const SCENE_WINDOW_LINES = 6

/** A scene break line: `* * *`, `***`, `---`, `◇`, `◆` or `#` alone on its line. */
const BREAK_LINE = /^\s*(\*\s*\*\s*\*|\*{3,}|-{3,}|◇+|◆+|#)\s*$/

/**
 * The scene that contains [start, end), or null when the span is not inside one scene. The range
 * is trimmed: it starts and ends on text, never on a break line or a blank line around one.
 */
export function sceneRangeAt(text: string, start: number, end: number): SceneRange | null {
  if (text.trim() === '' || start < 0 || end > text.length || start >= end) return null
  const scenes = breakSegments(text)
  if (scenes !== null) {
    const scene = scenes.find((s) => s.start <= start && end <= s.end)
    return scene ?? null
  }
  return windowRange(text, start, end)
}

/**
 * The trimmed segments between break lines, including the one before the first and the one after
 * the last break line. Null when the text has no break line.
 */
function breakSegments(text: string): SceneRange[] | null {
  const segments: SceneRange[] = []
  let segmentStart = 0
  let hasBreak = false
  let lineStart = 0
  for (;;) {
    const newline = text.indexOf('\n', lineStart)
    const lineEnd = newline === -1 ? text.length : newline
    if (BREAK_LINE.test(text.slice(lineStart, lineEnd))) {
      hasBreak = true
      pushTrimmed(text, segmentStart, lineStart, segments)
      segmentStart = lineEnd
    }
    if (newline === -1) break
    lineStart = newline + 1
  }
  if (!hasBreak) return null
  pushTrimmed(text, segmentStart, text.length, segments)
  return segments
}

/** Adds [from, to) trimmed to its text, unless it holds no text. */
function pushTrimmed(text: string, from: number, to: number, out: SceneRange[]): void {
  const raw = text.slice(from, to)
  const trimmed = raw.trim()
  if (trimmed === '') return
  const start = from + (raw.length - raw.trimStart().length)
  out.push({ start, end: start + trimmed.length })
}

/** No break line: the paragraphs holding the span, widened by the window on each side. */
function windowRange(text: string, start: number, end: number): SceneRange | null {
  const paragraphs = splitParagraphs(text)
  const first = paragraphs.findIndex((p) => p.end > start)
  let last = -1
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    if (paragraphs[i].start < end) {
      last = i
      break
    }
  }
  if (first === -1 || last === -1 || last < first) return null
  const from = Math.max(0, first - SCENE_WINDOW_LINES)
  const to = Math.min(paragraphs.length - 1, last + SCENE_WINDOW_LINES)
  return { start: paragraphs[from].start, end: paragraphs[to].end }
}
