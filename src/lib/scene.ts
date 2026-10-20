// Scene ranges for the scene rewrite (spec 7, brief D). A chapter with scene break lines is split
// at those lines. A chapter without them is cut into a window of paragraphs around the quote.
// Pure functions: no DB, no AI.

import { splitParagraphs } from '@/lib/korean/paragraphs'

export type SceneRange = { start: number; end: number }

/** Paragraphs taken on each side of the quoted paragraph when the text has no break line. */
export const SCENE_WINDOW_LINES = 6

/** A scene break line: `* * *`, `***`, `---`, `◇`, `◆` or `#` alone on its line. */
const BREAK_LINE = /^\s*(\*\s*\*\s*\*|\*{3,}|-{3,}|◇+|◆+|#)\s*$/

/** True when the line is a scene break line (one line, without its newline). */
export function isBreakLine(line: string): boolean {
  return BREAK_LINE.test(line)
}

/** A line so far that could still become a blank line or a break line. */
const BREAK_PREFIX = /^[\s*\-◇◆#]*$/

function isBlankOrBreak(line: string): boolean {
  return line.trim() === '' || isBreakLine(line)
}

/**
 * Filters the streamed text of one scene so that it neither starts nor ends with a break line or
 * the blank lines around one. Code joins scenes with its own break line, so one the model wrote at
 * the edge of a scene would double it. A break line in the middle of a scene is kept.
 *
 * `push` takes the next chunk and returns the text that is safe to send now. A trailing run of
 * blank and break lines is held back until more text follows it, and `end` drops it. A start that
 * could still turn into a break line (`*`, `**`) is held until the line is known.
 */
export function createSceneEdgeFilter(): { push(chunk: string): string; end(): string } {
  let started = false
  let held = ''
  const push = (chunk: string): string => {
    let text = held + chunk
    held = ''
    if (!started) {
      text = dropLeadingBreakLines(text)
      if (!text.includes('\n') && BREAK_PREFIX.test(text)) {
        held = text
        return ''
      }
      started = true
      text = text.trimStart()
    }
    const keep = trailingBreakStart(text)
    held = text.slice(keep)
    return text.slice(0, keep)
  }
  return {
    push,
    // A closing newline completes the last line, so only blank and break lines stay unsent.
    end() {
      const rest = push('\n')
      held = ''
      return rest
    },
  }
}

/** The text without its leading complete lines that are blank or break lines. */
function dropLeadingBreakLines(text: string): string {
  let from = 0
  for (;;) {
    const newline = text.indexOf('\n', from)
    if (newline === -1 || !isBlankOrBreak(text.slice(from, newline))) break
    from = newline + 1
  }
  return text.slice(from)
}

/**
 * Where the trailing run of blank lines, break lines and a line that may still become one begins:
 * the newline that ends the last line of text. The text length when there is no such run.
 */
function trailingBreakStart(text: string): number {
  const lines = text.split('\n')
  let last = lines.length - 1
  if (!BREAK_PREFIX.test(lines[last])) return text.length
  last--
  while (last >= 0 && isBlankOrBreak(lines[last])) last--
  if (last < 0) return 0
  return lines.slice(0, last + 1).join('\n').length
}

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
 * The spans of a chapter for the length expansion (stage 1b): the trimmed segments between its
 * break lines, or, with no break line, its paragraphs cut into `max(1, fallbackCount)` runs of
 * nearly equal paragraph counts (earlier runs one larger). Spans are in order and cover every
 * paragraph exactly once. A run never comes out empty, so there are at most as many spans as
 * paragraphs.
 */
export function sceneSpans(text: string, fallbackCount: number): SceneRange[] {
  const segments = breakSegments(text)
  if (segments !== null) return segments
  const paragraphs = splitParagraphs(text)
  if (paragraphs.length === 0) return []
  const runs = Math.min(paragraphs.length, Math.max(1, Math.floor(fallbackCount)))
  const base = Math.floor(paragraphs.length / runs)
  const extra = paragraphs.length % runs
  const spans: SceneRange[] = []
  let index = 0
  for (let run = 0; run < runs; run++) {
    const size = base + (run < extra ? 1 : 0)
    const first = paragraphs[index]
    const last = paragraphs[index + size - 1]
    spans.push({ start: first.start, end: last.end })
    index += size
  }
  return spans
}

/**
 * The text with each span replaced by its new text. Replacements are applied from the back, so
 * their offsets stay valid; everything outside the given spans is kept as it was.
 */
export function spliceSpans(
  text: string,
  replacements: { span: SceneRange; text: string }[],
): string {
  let out = text
  const ordered = [...replacements].sort((a, b) => b.span.start - a.span.start)
  for (const { span, text: next } of ordered) {
    out = out.slice(0, span.start) + next + out.slice(span.end)
  }
  return out
}

/**
 * The scene texts of a chapter: the trimmed segments between its break lines. A text with no break
 * line is one scene. Used for the per-scene lengths of the eval (stage 1).
 */
export function splitScenes(text: string): string[] {
  const segments = breakSegments(text)
  if (segments === null) return [text.trim()]
  return segments.map((segment) => text.slice(segment.start, segment.end))
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
    if (isBreakLine(text.slice(lineStart, lineEnd))) {
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
