import Link from 'next/link'

export default function AppNotFound() {
  return (
    <div className="b-wrap wg-auth-status">
      <p className="b-subhead">페이지를 찾지 못했어요</p>
      <p className="b-label b-muted">주소를 다시 확인해 주세요.</p>
      <Link href="/works" className="b-link b-control inline-flex min-h-11 items-center">
        내 작품으로 가기
      </Link>
    </div>
  )
}
