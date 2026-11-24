import Link from 'next/link'
import { PageEdge, PageHeaderFrame } from '@/components/app/page-header'
import { GridTitle } from '@/components/motion'

export default function AppNotFound() {
  return (
    <div className="b-wrap wg-auth-status">
      <PageHeaderFrame className="w-full wg-auth-status-header">
        <PageEdge />
        <div className="wg-shell-heading">
          <GridTitle as="p" size="page">
            페이지를 찾지 못했어요
          </GridTitle>
          <p className="b-label b-muted b-write">주소를 다시 확인해 주세요.</p>
        </div>
      </PageHeaderFrame>
      <Link href="/works" className="b-link b-control b-write inline-flex min-h-11 items-center">
        내 작품으로 가기
      </Link>
    </div>
  )
}
