'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MenuSheet, PopLink } from '@/components/motion'
import { Button } from '@/components/ui/button'
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
    <header className="b-top wg-shell-top">
      <div className="b-wrap b-nav-inner">
        <Link href="/works" className="wg-shell-logo" aria-label="다음화">
          <span aria-hidden="true">다</span>
          <span aria-hidden="true">음</span>
          <span aria-hidden="true">화</span>
        </Link>
        <div className="wg-shell-account">
          {user.isAnonymous ? (
            <>
              <span className="wg-shell-trial-label">체험 중</span>
              <PopLink
                href="/signup"
                arrow={false}
                className="wg-shell-signup"
                onNavigate={(event) => {
                  event.preventDefault()
                  void continueToSignup()
                }}
              >
                가입 후 작품 이어가기
              </PopLink>
            </>
          ) : (
            <span className="wg-shell-user hidden truncate sm:block">{user.name}</span>
          )}
          <Button variant="link" size="sm" onClick={signOut} className="hidden sm:inline-flex">
            로그아웃
          </Button>
          <MenuSheet
            title={user.isAnonymous ? '체험 중' : user.name}
            label="계정 메뉴 열기"
            className="wg-shell-menu-sheet"
            triggerClassName="shrink-0 sm:hidden"
          >
            <Link className="wg-shell-account-link" href="/works">
              <span>내 작품</span>
            </Link>
            <Button variant="link" onClick={signOut}>
              로그아웃
            </Button>
          </MenuSheet>
        </div>
      </div>
    </header>
  )
}
