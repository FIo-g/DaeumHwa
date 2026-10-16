'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import type { SessionUser } from '@/server/session'

/** Top bar for signed-in pages: logo, user name and sign-out. */
export function TopBar({ user }: { user: SessionUser }) {
  const router = useRouter()

  async function signOut() {
    try {
      const result = await authClient.signOut()
      if (result.error) {
        toast.error('잠시 후 다시 시도해 주세요.')
        return
      }
    } catch {
      toast.error('잠시 후 다시 시도해 주세요.')
      return
    }
    router.replace('/login')
    router.refresh()
  }

  return (
    <header className="border-b bg-background">
      <div className="flex h-14 items-center justify-between gap-4 px-4">
        <Link href="/works" className="text-base font-semibold tracking-tight">
          다음화
        </Link>
        <div className="flex items-center gap-3">
          <span className="truncate text-sm text-muted-foreground">{user.name}</span>
          <Button variant="ghost" size="sm" onClick={signOut}>
            로그아웃
          </Button>
        </div>
      </div>
    </header>
  )
}
