import { PageHeader } from '@/components/app/page-header'
import { PopLink, Sheet } from '@/components/motion'
import { TRIAL_SIGNUP_MESSAGE } from '@/lib/trial'

export function TrialToolGate({
  title,
  description,
}: {
  title: string
  band: 'kraft' | 'sand' | 'cream'
  description: string
}) {
  return (
    <div className="flex flex-col">
      <PageHeader title={title} description={TRIAL_SIGNUP_MESSAGE} />
      <Sheet className="wg-shell-trial-gate">
        <p className="b-lede">{description}</p>
        <PopLink href="/signup" arrow={false}>
          가입 후 작품 이어가기
        </PopLink>
      </Sheet>
    </div>
  )
}
