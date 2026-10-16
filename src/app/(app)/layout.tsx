import type { ReactNode } from 'react'
import { DemoBanner } from '@/components/app/demo-banner'
import { TopBar } from '@/components/app/top-bar'
import { requirePageUser } from '@/server/session'

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser()
  return (
    <div className="flex flex-1 flex-col">
      <TopBar user={user} />
      <DemoBanner />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  )
}
