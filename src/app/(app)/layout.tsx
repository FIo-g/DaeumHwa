import type { ReactNode } from 'react'
import { headers } from 'next/headers'
import { AiSetupBanner } from '@/components/app/ai-setup-banner'
import { ModelNotice } from '@/components/app/model-notice'
import { TopBar } from '@/components/app/top-bar'
import { requirePageUser } from '@/server/session'

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Set by src/proxy.ts for /works and /invite requests. Used as the return path after login.
  const pathname = (await headers()).get('x-pathname') ?? undefined
  const user = await requirePageUser(pathname)
  return (
    <div className="flex flex-1 flex-col">
      <TopBar user={user} />
      <AiSetupBanner />
      <ModelNotice />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  )
}
