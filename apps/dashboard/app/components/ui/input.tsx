import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-[var(--radius-control)] border border-input bg-card/90 px-3 py-1 text-base transition-[color,background-color,border-color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:mr-3 file:inline-flex file:h-7 file:items-center file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-foreground/25 hover:bg-card focus-visible:bg-popover disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-muted/65 dark:hover:bg-muted/85 dark:focus-visible:bg-popover",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
