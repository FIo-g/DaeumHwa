'use client'

import { Switch as SwitchPrimitive } from '@base-ui/react/switch'
import { cn } from 'cn'

function Switch({
  className,
  size = 'default',
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: 'sm' | 'default'
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'wg-ui-switch peer relative inline-flex h-11 w-12 shrink-0 cursor-pointer items-center data-[size=sm]:h-9 data-[size=sm]:w-10 data-disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="wg-ui-switch-thumb pointer-events-none absolute block"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
