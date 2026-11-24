import * as React from 'react'
import { cn } from 'cn'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'wg-ui-field wg-ui-textarea flex field-sizing-content min-h-16 w-full px-3 text-base disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
