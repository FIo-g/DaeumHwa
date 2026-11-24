import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const layout = readFileSync(new URL('./layout.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8')
const redesign = readFileSync(new URL('./redesign.css', import.meta.url), 'utf8')

describe('font setup', () => {
  it('loads the three manuscript-theme typefaces on the document with next/font', () => {
    expect(layout).toMatch(
      /import \{ IBM_Plex_Sans_KR, Nanum_Gothic_Coding, Noto_Serif_KR \} from 'next\/font\/google'/,
    )
    expect(layout).toMatch(
      /Noto_Serif_KR\(\{\s*weight: \['400', '500', '700', '900'\][\s\S]*?variable: '--font-display-ko'/,
    )
    expect(layout).toMatch(
      /IBM_Plex_Sans_KR\(\{\s*weight: \['400', '500', '600', '700'\][\s\S]*?variable: '--font-body-ko'/,
    )
    expect(layout).toMatch(
      /Nanum_Gothic_Coding\(\{\s*weight: \['400', '700'\][\s\S]*?variable: '--font-mono-ko'/,
    )
    expect(layout).toMatch(/<html[\s\S]*?display\.variable,\s*body\.variable,\s*mono\.variable/)
  })

  it('maps titles to the serif, interface text to the sans and counts to the mono stack', () => {
    for (const [utility, variable] of [
      ['sans', 'body'],
      ['serif', 'body'],
      ['heading', 'title'],
      ['mono', 'mono'],
    ]) {
      expect(css).toContain(`--font-${utility}: var(--b-font-${variable});`)
    }
    expect(redesign).toMatch(/--b-font-title:\s*var\(--font-display-ko, 'Noto Serif KR'\)/)
    expect(redesign).toMatch(/--b-font-body:\s*var\(--font-body-ko, 'IBM Plex Sans KR'\)/)
    expect(redesign).toMatch(/--b-font-mono:\s*var\(--font-mono-ko, 'Nanum Gothic Coding'\)/)
    expect(redesign).toMatch(/Apple SD Gothic Neo/)
    expect(redesign).toMatch(/Malgun Gothic/)
    expect(css + redesign).not.toMatch(/Black\s+Han\s+Sans/)
    expect(css + redesign).not.toMatch(/Nanum\s+Pen\s+Script/)
  })
})
