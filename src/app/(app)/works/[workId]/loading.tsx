import { Skeleton } from '@/components/ui/skeleton'

// Shown while a work page streams. Rendered inside WorkLayout, so the sidebar stays visible.
export default function WorkLoading() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">불러오는 중입니다.</span>
      <Skeleton className="h-8 w-48 max-w-full" />
      <Skeleton className="h-4 w-80 max-w-full" />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  )
}
