import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const layout = readFileSync(new URL('./layout.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8')

describe('font setup', () => {
  it('does not load a Google font package in the root layout', () => {
    expect(layout).not.toContain('next/font')
    expect(layout).not.toContain('Geist')
  })

  it('uses the Korean system font stack for the sans font', () => {
    expect(css).toMatch(/Apple SD Gothic Neo/)
    expect(css).toMatch(/Malgun Gothic/)
    expect(css).toMatch(/Noto Sans KR/)
    expect(css).not.toContain('Geist')
  })
})
