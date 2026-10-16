import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export type FilterOption = { label: string; href: string; active: boolean }

type FilterLinksProps = {
  label: string
  options: FilterOption[]
}

/** A row of filter chips. Each chip is a link, so filters live in the URL and need no client state. */
export function FilterLinks({ label, options }: FilterLinksProps) {
  return (
    <nav aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      {options.map((option) => (
        <Link
          key={option.href}
          href={option.href}
          aria-current={option.active ? 'true' : undefined}
          className={buttonVariants({
            variant: option.active ? 'secondary' : 'outline',
            size: 'sm',
          })}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  )
}
