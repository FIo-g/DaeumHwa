import type { Metadata } from 'next'
import './globals.css'
import { cn } from '@/lib/utils'
import { Toaster } from '@/components/ui/sonner'

export const metadata: Metadata = {
  title: '다음화',
  description: '웹소설 작가를 위한 설정 위키와 연재 일관성 점검 도구',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko" className={cn('h-full antialiased', 'font-sans')}>
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  )
}
