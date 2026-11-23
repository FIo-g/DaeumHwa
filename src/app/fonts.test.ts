import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const layout = readFileSync(new URL('./layout.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8')

describe('font setup', () => {
  it('loads only the Noto Serif KR Myeongjo from next/font', () => {
    expect(layout).toMatch(/import \{ Noto_Serif_KR \} from 'next\/font\/google'/)
    expect(layout).toContain('--font-serif-ko')
    expect(layout).not.toContain('Geist')
  })

  it('keeps the Korean system font stack for UI text', () => {
    expect(css).toMatch(/Apple SD Gothic Neo/)
    expect(css).toMatch(/Malgun Gothic/)
    expect(css).toMatch(/Noto Sans KR/)
    expect(css).toMatch(/--font-serif: var\(--font-serif-ko\)/)
    expect(css).not.toContain('Geist')
  })
})
