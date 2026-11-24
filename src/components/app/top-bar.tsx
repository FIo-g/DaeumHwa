'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { flushPendingSaves } from '@/lib/client/use-autosave'
import type { SessionUser } from '@/server/session'

/** Top bar for signed-in pages: logo, user name and sign-out. */
export function TopBar({ user }: { user: SessionUser }) {
  const router = useRouter()

  async function continueToSignup() {
    if (await flushPendingSaves()) router.push('/signup')
    else toast.error('원고를 저장한 뒤 다시 시도해 주세요.')
  }

  async function signOut() {
    await flushPendingSaves()
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
    <header className="border-b border-rule bg-sheet">
      <div className="flex h-14 items-center justify-between gap-4 px-4 md:px-6">
        <Link href="/works" className="font-serif text-lg font-bold tracking-tight">
          다음화
        </Link>
        <div className="flex items-center gap-3">
          {user.isAnonymous ? (
            <>
              <span className="whitespace-nowrap text-sm text-muted-foreground">체험 중</span>
              <Link
                href="/signup"
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
                onNavigate={(event) => {
                  event.preventDefault()
                  void continueToSignup()
                }}
              >
                가입 후 작품 이어가기
              </Link>
            </>
          ) : (
            <span className="truncate text-sm text-muted-foreground">{user.name}</span>
          )}
          <Button variant="ghost" size="sm" onClick={signOut}>
            로그아웃
          </Button>
        </div>
      </div>
    </header>
  )
}
