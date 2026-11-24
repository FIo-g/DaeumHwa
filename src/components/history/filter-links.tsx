import Link from 'next/link'

export type FilterOption = { label: string; href: string; active: boolean }

type FilterLinksProps = {
  label: string
  options: FilterOption[]
}

export function FilterLinks({ label, options }: FilterLinksProps) {
  return (
    <nav aria-label={label} className="wg-history-filter">
      <span className="wg-history-filter-label">{label}</span>
      <div className="wg-history-filter-cells">
        {options.map((option) => (
          <Link
            key={option.href}
            href={option.href}
            aria-current={option.active ? 'true' : undefined}
            className="wg-history-filter-cell b-control"
            scroll={false}
          >
            {option.label}
            <span className="wg-history-filter-ink" data-label={option.label} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </nav>
  )
}
