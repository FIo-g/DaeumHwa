// Generic loading state for app pages such as /works and /invite. Rendered inside AppLayout.
export default function AppLoading() {
  return (
    <div role="status" aria-busy="true" className="b-wrap max-w-3xl py-app flex flex-col gap-4">
      <div aria-hidden="true" className="b-cells b-status-cells" data-loading>
        {Array.from({ length: 8 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <span className="b-label b-muted">불러오는 중이에요.</span>
    </div>
  )
}
