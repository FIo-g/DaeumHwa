export function threadChapterCenter(chapter: number, chapters: number, plotWidth: number): number {
  return ((chapter - 0.5) * plotWidth) / chapters
}
