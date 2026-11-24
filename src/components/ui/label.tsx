'use client'

import * as React from 'react'
import { cn } from 'cn'

function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <label
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-xs font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:text-muted-ink peer-disabled:cursor-not-allowed peer-disabled:text-muted-ink',
        className,
      )}
      {...props}
    />
  )
}

export { Label }
