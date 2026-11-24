import { factValidityText } from '@/lib/labels'

export function FactValidity({ from, to }: { from: number | null; to: number | null }) {
  const validity = factValidityText(from, to)
  if (!validity) return null

  return (
    <span className="b-muted">
      {validity.split(/(\d+화)/u).map((part, index) =>
        index % 2 === 1 ? (
          <span key={index} className="font-mono">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </span>
  )
}
