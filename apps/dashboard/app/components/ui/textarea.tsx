import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-[var(--radius-control)] border border-input bg-card/90 px-3 py-2 text-base transition-[color,background-color,border-color,box-shadow] outline-none placeholder:text-muted-foreground hover:border-foreground/25 hover:bg-card focus-visible:border-ring focus-visible:bg-popover focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-muted/65 dark:hover:bg-muted/85 dark:focus-visible:bg-popover dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
