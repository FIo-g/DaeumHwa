import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/server/session'

export default async function AuthLayout({ children }: { children: ReactNode }) {
  if (await getSessionUser()) redirect('/works')
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <header className="mb-6 flex flex-col gap-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">다음화</h1>
          <p className="text-sm text-muted-foreground">설정과 떡밥을 기억하는 웹소설 연재 파트너</p>
        </header>
        {children}
      </div>
    </main>
  )
}
