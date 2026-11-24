'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { GridTitle, Sheet } from '@/components/motion'

export default function AuthTemplate({ children }: { children: ReactNode }) {
  const signup = usePathname() === '/signup'
  return (
    <Sheet as="div" className="b-wrap wg-auth-sheet" label="20×10" page={signup ? '02' : '01'}>
      <div className="wg-auth-columns" key={signup ? 'signup' : 'login'}>
        <header className="wg-auth-heading">
          <GridTitle as="h1" size="page" columns={signup ? 2 : 3}>
            {signup ? '가입' : '로그인'}
          </GridTitle>
          <p className="b-lede wg-auth-written-line">작가 대신 설정을 기억하는 연재 파트너</p>
        </header>
        <div className="wg-auth-body">{children}</div>
      </div>
    </Sheet>
  )
}
