import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'

const buttonVariants = cva(
  "group/button b-control inline-flex shrink-0 items-center justify-center rounded-button border-2 border-transparent bg-clip-padding text-sm font-bold whitespace-nowrap select-none not-disabled:active:not-aria-[haspopup]:translate-y-px disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'border-ink bg-ink text-paper not-disabled:hover:bg-muted-ink',
        outline: 'border-ink bg-paper text-ink not-disabled:hover:bg-sand aria-expanded:bg-sand',
        secondary: 'border-ink bg-kraft text-ink not-disabled:hover:bg-sand aria-expanded:bg-sand',
        ghost: 'text-ink not-disabled:hover:bg-sand aria-expanded:bg-sand',
        destructive:
          'border-ink bg-cream text-ink not-disabled:hover:bg-ink not-disabled:hover:text-paper',
        link: 'text-ink underline underline-offset-4 hover:decoration-2',
      },
      size: {
        default:
          'h-11 gap-2 px-4 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        xs: "h-9 gap-1 px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-9 gap-1 px-3 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-13 gap-2 px-6 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        icon: 'size-11',
        'icon-xs':
          "size-9 in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-9 in-data-[slot=button-group]:rounded-lg',
        'icon-lg': 'size-13',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
