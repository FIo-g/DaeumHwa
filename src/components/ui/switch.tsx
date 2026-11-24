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
        'b-switch-control b-control peer group/switch relative inline-flex h-11 w-12 shrink-0 cursor-pointer items-center rounded-field data-[size=sm]:h-9 data-[size=sm]:w-10 data-disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="b-switch-thumb pointer-events-none relative block size-4 rounded-full border border-ink bg-paper transition-transform duration-(--b-step) ease-out-b group-data-[size=sm]/switch:size-3.5"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
