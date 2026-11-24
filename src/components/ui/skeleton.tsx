import { cn } from 'cn'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('b-skeleton rounded-field border border-ink/25 bg-muted', className)}
      {...props}
    />
  )
}

export { Skeleton }
