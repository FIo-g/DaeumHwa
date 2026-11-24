'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

export default function AuthTemplate({ children }: { children: ReactNode }) {
  const signup = usePathname() === '/signup'
  return (
    <div className="b-route-frame" data-auth-page={signup ? 'signup' : 'login'}>
      <h2 className="b-heading b-route-heading mb-6">{signup ? '가입' : '로그인'}</h2>
      {children}
    </div>
  )
}
