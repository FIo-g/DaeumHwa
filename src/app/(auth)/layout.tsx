import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/server/session'

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser()
  if (user && !user.isAnonymous) redirect('/works')
  return (
    <main className="flex flex-1 items-start justify-center px-4 py-10 sm:items-center sm:py-16">
      <div className="w-full max-w-sm bg-sheet px-6 py-8 shadow-sheet sm:px-8 sm:py-10">
        <header className="mb-8 flex flex-col gap-2">
          <h1 className="font-serif text-3xl font-bold tracking-tight">
            <Link href="/">다음화</Link>
          </h1>
          <p className="text-sm text-muted-foreground">설정과 떡밥을 기억하는 웹소설 연재 파트너</p>
        </header>
        {children}
      </div>
    </main>
  )
}
