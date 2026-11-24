import * as React from 'react'
import { Input as InputPrimitive } from '@base-ui/react/input'
import { cn } from 'cn'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'b-field-control h-11 w-full min-w-0 rounded-field border border-input bg-paper px-3 py-2 text-base placeholder:text-muted-foreground file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-bold file:text-ink disabled:cursor-not-allowed disabled:bg-muted aria-invalid:border-ink',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
