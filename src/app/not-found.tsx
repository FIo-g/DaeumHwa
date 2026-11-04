import Link from 'next/link'
import { EmptyState } from '@/components/app/empty-state'
import { buttonVariants } from '@/components/ui/button'

export default function RootNotFound() {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-16">
      <EmptyState
        title="페이지를 찾을 수 없습니다"
        description="주소가 바뀌었거나 볼 수 없는 페이지입니다."
        action={
          <Link href="/" className={buttonVariants({ variant: 'outline' })}>
            처음으로 가기
          </Link>
        }
      />
    </div>
  )
}
