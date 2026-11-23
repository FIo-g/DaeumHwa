import type { Metadata } from 'next'
import { Noto_Serif_KR } from 'next/font/google'
import './globals.css'
import { cn } from '@/lib/utils'
import { Toaster } from '@/components/ui/sonner'

// The proof-sheet Myeongjo: headings, manuscript text and quoted wiki originals. UI text stays on the
// system Hangul sans. Hangul glyphs ship as unicode-range slices, so nothing is preloaded.
const serif = Noto_Serif_KR({
  subsets: ['latin'],
  variable: '--font-serif-ko',
  display: 'swap',
  preload: false,
})

export const metadata: Metadata = {
  title: '다음화',
  description: '웹소설 작가를 위한 설정 위키와 연재 일관성 점검 도구',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" className={cn('h-full antialiased', 'font-sans', serif.variable)}>
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  )
}
