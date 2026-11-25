import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const PRESSED_CHOICE_STYLE =
  "aria-[pressed=true]:border aria-[pressed=true]:border-[var(--choice-active-border)] aria-[pressed=true]:bg-[var(--choice-active-bg)] dark:aria-[pressed=true]:bg-[var(--choice-active-bg)] aria-[pressed=true]:text-[var(--choice-active-fg)] aria-[pressed=true]:font-semibold aria-[pressed=true]:shadow-none aria-[pressed=true]:hover:bg-[var(--choice-active-bg)] dark:aria-[pressed=true]:hover:bg-[var(--choice-active-bg)] aria-[pressed=true]:hover:text-[var(--choice-active-fg)]"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-[color-mix(in_oklab,var(--primary)_86%,black)] dark:hover:bg-[color-mix(in_oklab,var(--primary)_92%,white)] disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/25 dark:focus-visible:ring-destructive/40 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none",
        outline:
          `border border-border bg-card text-foreground shadow-[var(--shadow-subtle)] hover:bg-accent hover:text-accent-foreground disabled:bg-muted/75 disabled:text-muted-foreground disabled:shadow-none dark:bg-secondary/75 dark:hover:bg-accent dark:disabled:bg-muted/75 ${PRESSED_CHOICE_STYLE}`,
        secondary:
          `bg-secondary text-secondary-foreground hover:bg-accent disabled:bg-muted/80 disabled:text-muted-foreground ${PRESSED_CHOICE_STYLE}`,
        ghost:
          `hover:bg-accent hover:text-accent-foreground disabled:text-muted-foreground dark:hover:bg-accent/70 ${PRESSED_CHOICE_STYLE}`,
        link: "text-foreground underline-offset-4 hover:underline disabled:text-muted-foreground",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
