/** Share of the target reached, or null when the chapter is at or over the target. */
export function lengthShortfall(
  charCount: number,
  targetChars: number,
): { percent: number } | null {
  if (targetChars <= 0 || charCount >= targetChars) return null
  return { percent: Math.round((charCount / targetChars) * 100) }
}

export function shortfallMessage(charCount: number, targetChars: number): string {
  const percent = Math.round((charCount / targetChars) * 100)
  return `목표 ${targetChars.toLocaleString('ko-KR')}자 중 ${charCount.toLocaleString('ko-KR')}자(${percent}%)입니다. 그래도 완료할까요?`
}
