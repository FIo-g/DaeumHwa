import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const layout = readFileSync(new URL('./layout.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8')
const redesign = readFileSync(new URL('./redesign.css', import.meta.url), 'utf8')

describe('font setup', () => {
  it('loads the three design typefaces on the document with next/font', () => {
    expect(layout).toMatch(
      /import \{ Black_Han_Sans, IBM_Plex_Sans_KR, Nanum_Pen_Script \} from 'next\/font\/google'/,
    )
    expect(layout).toMatch(
      /Black_Han_Sans\(\{\s*weight: '400'[\s\S]*?variable: '--font-display-ko'/,
    )
    expect(layout).toMatch(
      /IBM_Plex_Sans_KR\(\{\s*weight: \['400', '500', '600', '700'\][\s\S]*?variable: '--font-body-ko'/,
    )
    expect(layout).toMatch(/Nanum_Pen_Script\(\{\s*weight: '400'[\s\S]*?variable: '--font-hand-ko'/)
    expect(layout).toMatch(/<html[\s\S]*?display\.variable,\s*body\.variable,\s*hand\.variable/)
  })

  it('maps body and compatibility serif text to the same Hangul sans stack', () => {
    for (const [utility, variable] of [
      ['sans', 'body'],
      ['serif', 'body'],
      ['heading', 'title'],
      ['hand', 'hand'],
    ]) {
      expect(css).toContain(`--font-${utility}: var(--b-font-${variable});`)
    }
    expect(redesign).toMatch(/--b-font-title:\s*var\(--font-display-ko, 'Black Han Sans'\)/)
    expect(redesign).toMatch(/--b-font-body:\s*var\(--font-body-ko, 'IBM Plex Sans KR'\)/)
    expect(redesign).toMatch(/--b-font-hand:\s*var\(--font-hand-ko, 'Nanum Pen Script'\)/)
    expect(redesign).toMatch(/Apple SD Gothic Neo/)
    expect(redesign).toMatch(/Malgun Gothic/)
    expect(redesign).toMatch(/Noto Sans KR/)
    expect(css + redesign).not.toContain('--font-serif-ko')
  })
})
