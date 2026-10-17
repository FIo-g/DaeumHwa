import { Skeleton } from '@/components/ui/skeleton'

// Generic loading state for app pages such as /works and /invite. Rendered inside AppLayout.
export default function AppLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-10"
    >
      <span className="sr-only">불러오는 중입니다.</span>
      <Skeleton className="h-8 w-40 max-w-full" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  )
}
