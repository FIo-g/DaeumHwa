import { Skeleton } from '@/components/ui/skeleton'

// Generic loading state for app pages such as /works and /invite. Rendered inside AppLayout.
export default function AppLoading() {
  return (
    <div role="status" aria-busy="true" className="b-wrap flex max-w-3xl flex-col gap-4 py-app">
      <span className="sr-only">불러오는 중이에요.</span>
      <Skeleton className="h-12 w-48 max-w-full bg-kraft" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  )
}
