'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { runAction } from '@/lib/client/run-action'
import { createSampleWorkAction } from '@/server/actions/sample-work'
import { authErrorMessage } from './auth-utils'

type TrialButtonProps = {
  variant?: 'default' | 'outline'
  className?: string
}

export function TrialButton({ variant, className }: TrialButtonProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function startTrial() {
    setPending(true)
    try {
      const current = await authClient.getSession()
      if (current.error) {
        toast.error(authErrorMessage('login', current.error))
      } else if (current.data && !current.data.user.isAnonymous) {
        router.replace('/works')
        return
      } else {
        if (!current.data) {
          const signedIn = await authClient.signIn.anonymous()
          if (signedIn.error) {
            toast.error(authErrorMessage('login', signedIn.error))
            setPending(false)
            return
          }
        }
        const sample = await runAction(createSampleWorkAction())
        if (sample) {
          router.push(`/works/${sample.workId}/chapters/${sample.chapterId}?demo=1`)
          return
        }
      }
    } catch {
      toast.error(authErrorMessage('login', null))
    }
    setPending(false)
  }

  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      disabled={pending}
      onClick={startTrial}
    >
      {pending ? '체험 준비 중…' : '가입 없이 체험하기'}
    </Button>
  )
}
