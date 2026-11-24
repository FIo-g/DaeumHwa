import type { ReactNode } from 'react'
import { ScanLine } from '@/components/motion'
import { Button } from '@/components/ui/button'

type SubmitButtonProps = {
  children: ReactNode
  pending?: boolean
}

/** Form submit button that disables itself and fills manuscript cells while pending. */
export function SubmitButton({ children, pending = false }: SubmitButtonProps) {
  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      <ScanLine active={pending} className="wg-shell-scan wg-shell-scan-button" />
      {children}
    </Button>
  )
}
