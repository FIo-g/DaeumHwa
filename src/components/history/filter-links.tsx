import Link from 'next/link'

export type FilterOption = { label: string; href: string; active: boolean }

type FilterLinksProps = {
  label: string
  options: FilterOption[]
}

export function FilterLinks({ label, options }: FilterLinksProps) {
  return (
    <nav aria-label={label} className="b-works-filters">
      <span className="b-label font-bold">{label}</span>
      <div className="flex min-w-0 flex-wrap gap-2">
        {options.map((option) => (
          <Link
            key={option.href}
            href={option.href}
            aria-current={option.active ? 'true' : undefined}
            className="b-works-filter"
            scroll={false}
          >
            <span>{option.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  )
}
