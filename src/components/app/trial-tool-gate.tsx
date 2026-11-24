import { PageHeader } from '@/components/app/page-header'
import { PopLink, Reveal } from '@/components/motion'
import { TRIAL_SIGNUP_MESSAGE } from '@/lib/trial'

export function TrialToolGate({
  title,
  band,
  description,
}: {
  title: string
  band: 'kraft' | 'sand' | 'cream'
  description: string
}) {
  return (
    <div className="flex flex-col">
      <PageHeader title={title} band={band} description={TRIAL_SIGNUP_MESSAGE} />
      <Reveal className="b-paper grid max-w-xl justify-items-start gap-4 bg-cream p-4 sm:p-6">
        <p className="b-lede">{description}</p>
        <PopLink href="/signup" variant="flat">
          가입 후 작품 이어가기
        </PopLink>
      </Reveal>
    </div>
  )
}
