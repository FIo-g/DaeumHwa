'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MenuSheet } from '@/components/motion/menu-sheet'
import { Button, buttonVariants } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { flushPendingSaves } from '@/lib/client/use-autosave'
import type { SessionUser } from '@/server/session'

/** Top bar for signed-in pages: logo, user name and sign-out. */
export function TopBar({ user }: { user: SessionUser }) {
  const router = useRouter()

  async function continueToSignup() {
    if (await flushPendingSaves()) router.push('/signup')
    else toast.error('원고를 저장하지 못했어요. 저장 상태를 확인해 주세요.')
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
    <header className="b-top">
      <div className="b-wrap b-nav-inner">
        <Link href="/works" className="b-brand b-link">
          <span>다음화</span>
        </Link>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {user.isAnonymous ? (
            <>
              <span className="b-label whitespace-nowrap text-muted-ink">체험 중</span>
              <Link
                href="/signup"
                className={buttonVariants({ variant: 'outline', className: 'px-2 sm:px-4' })}
                onNavigate={(event) => {
                  event.preventDefault()
                  void continueToSignup()
                }}
              >
                가입 후 작품 이어가기
              </Link>
            </>
          ) : (
            <span className="b-label hidden truncate text-muted-ink sm:block">{user.name}</span>
          )}
          <Button variant="ghost" onClick={signOut} className="hidden sm:inline-flex">
            로그아웃
          </Button>
          <MenuSheet
            title={user.isAnonymous ? '체험 중' : user.name}
            label="계정 메뉴 열기"
            triggerClassName="sm:hidden"
          >
            <Link className="b-row b-link flex items-center rounded-button border-0" href="/works">
              <span>내 작품</span>
            </Link>
            <Button variant="outline" onClick={signOut}>
              로그아웃
            </Button>
          </MenuSheet>
        </div>
      </div>
    </header>
  )
}
