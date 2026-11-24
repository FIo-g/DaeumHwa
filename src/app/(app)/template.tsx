import type { ReactNode } from 'react'

export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="b-route-frame">{children}</div>
}
