import { Badge } from '@/components/ui/badge'

/** Marks text that came from an AI suggestion. */
export function AiBadge() {
  return (
    <Badge variant="secondary" className="border-ink">
      AI 제안
    </Badge>
  )
}
