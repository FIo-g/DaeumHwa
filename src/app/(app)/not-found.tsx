import Link from 'next/link'

export default function AppNotFound() {
  return (
    <div className="b-wrap flex max-w-3xl flex-1 flex-col items-start gap-4 py-band">
      <div aria-hidden="true" className="b-cells b-status-cells">
        {Array.from({ length: 8 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <p className="b-subhead b-write">페이지를 찾지 못했어요</p>
      <p className="b-label b-muted">주소를 다시 확인해 주세요.</p>
      <Link href="/works" className="b-link b-control inline-flex min-h-11 items-center">
        내 작품으로 가기
      </Link>
    </div>
  )
}
