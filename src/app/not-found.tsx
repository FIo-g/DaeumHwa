import Link from 'next/link'
import { EmptyState } from '@/components/app/empty-state'
import { buttonVariants } from '@/components/ui/button'

export default function RootNotFound() {
  return (
    <div className="b-root b-band b-band--apricot flex flex-1 justify-center px-edge [&>*]:w-full [&>*]:max-w-lg">
      <EmptyState
        title="페이지를 찾지 못했어요"
        description="주소를 다시 확인해 주세요."
        action={
          <Link href="/" className={buttonVariants({ variant: 'outline' })}>
            처음으로 가기
          </Link>
        }
      />
    </div>
  )
}
