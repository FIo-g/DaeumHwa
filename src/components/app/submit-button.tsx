import { Loader2Icon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

type SubmitButtonProps = {
  children: ReactNode
  pending?: boolean
}

/** Form submit button that disables itself and shows a spinner while pending. */
export function SubmitButton({ children, pending = false }: SubmitButtonProps) {
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2Icon className="animate-spin" aria-hidden="true" />}
      {children}
    </Button>
  )
}
