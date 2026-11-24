'use client'

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'

function Tabs({ className, orientation = 'horizontal', ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn('group/tabs flex gap-2 data-horizontal:flex-col', className)}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  'group/tabs-list relative inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-button text-muted-ink group-data-vertical/tabs:flex-col group-data-vertical/tabs:items-stretch',
  {
    variants: {
      variant: {
        default: 'bg-muted p-1',
        line: 'rounded-none border-b border-ink bg-transparent',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function TabsList({
  className,
  children,
  variant = 'default',
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      {children}
      {variant === 'line' && <TabsPrimitive.Indicator className="b-tab-indicator" />}
    </TabsPrimitive.List>
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "b-control relative inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-field px-3 py-1 text-sm font-bold whitespace-nowrap text-muted-ink group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start enabled:hover:bg-sand enabled:active:translate-y-px data-active:text-ink group-data-[variant=default]/tabs-list:data-active:bg-sand disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn('min-w-0 flex-1 text-sm', className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
