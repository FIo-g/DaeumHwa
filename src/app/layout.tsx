import type { Metadata } from 'next'
import { Black_Han_Sans, IBM_Plex_Sans_KR, Nanum_Pen_Script } from 'next/font/google'
import './globals.css'
import { cn } from '@/lib/utils'
import { Toaster } from '@/components/ui/sonner'

// Display headings, body and manuscript text, and handwritten proof notes. Hangul glyphs ship as
// unicode-range slices, so nothing is preloaded.
const display = Black_Han_Sans({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display-ko',
  display: 'swap',
  preload: false,
})
const body = IBM_Plex_Sans_KR({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  variable: '--font-body-ko',
  display: 'swap',
  preload: false,
})
const hand = Nanum_Pen_Script({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-hand-ko',
  display: 'swap',
  preload: false,
})

export const metadata: Metadata = {
  title: '다음화',
  description: '웹소설 작가를 위한 설정 위키와 연재 일관성 점검 도구',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="ko"
      className={cn(
        'h-full antialiased',
        'font-sans',
        display.variable,
        body.variable,
        hand.variable,
      )}
    >
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  )
}
