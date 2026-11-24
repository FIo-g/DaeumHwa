import * as React from 'react'
import { cn } from 'cn'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'b-field-control flex field-sizing-content min-h-16 w-full rounded-field border border-input bg-paper px-3 py-2 text-base placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-muted aria-invalid:border-ink',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
