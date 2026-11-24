// Shown while a work page streams. Rendered inside WorkLayout, so the sidebar stays visible.
export default function WorkLoading() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <div aria-hidden="true" className="b-cells b-status-cells" data-loading>
        {Array.from({ length: 8 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <span className="b-label b-muted">불러오는 중이에요.</span>
    </div>
  )
}
