import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import {
  GATEWAY_ERROR_MESSAGES_ZH,
  isRawTechnicalErrorText,
  sanitizeUserFacingErrorText,
} from "@/lib/user-facing-error"
import { useLocale } from "@/shell/ui-locale"
import type { Locale } from "@/shell/locale"

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-[var(--radius-panel)] border-0 px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default:
          "bg-[color-mix(in_srgb,var(--card)_76%,var(--muted))] text-foreground dark:bg-card",
        destructive:
          "bg-destructive/10 text-[var(--destructive-ink)] *:data-[slot=alert-description]:text-[color-mix(in_srgb,var(--destructive-ink)_90%,transparent)] [&>svg]:text-current dark:bg-destructive/15",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      data-variant={variant}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight",
        className
      )}
      {...props}
    />
  )
}

function sanitizeAlertString(value: string, locale: Locale): string {
  if (isRawTechnicalErrorText(value)) {
    return sanitizeUserFacingErrorText(value, locale)
  }
  if (locale === "zh-CN" && value.trim() in GATEWAY_ERROR_MESSAGES_ZH) {
    return GATEWAY_ERROR_MESSAGES_ZH[value.trim()]
  }
  return value
}

function sanitizeAlertNode(node: React.ReactNode, locale: Locale): React.ReactNode {
  if (typeof node === "string") {
    return sanitizeAlertString(node, locale)
  }
  if (Array.isArray(node)) {
    let changed = false
    const next = node.map(item => {
      const sanitized = sanitizeAlertNode(item, locale)
      if (sanitized !== item) changed = true
      return sanitized
    })
    return changed ? next : node
  }
  if (
    React.isValidElement<{ children?: React.ReactNode }>(node) &&
    node.props.children !== undefined &&
    (typeof node.type === "string" || node.type === React.Fragment)
  ) {
    const nextChildren = sanitizeAlertNode(node.props.children, locale)
    if (nextChildren !== node.props.children) {
      return React.cloneElement(node, undefined, nextChildren)
    }
  }
  return node
}

function AlertDescription({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const { locale } = useLocale()
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground [&_p]:leading-relaxed",
        className
      )}
      {...props}
    >
      {sanitizeAlertNode(children, locale)}
    </div>
  )
}

export { Alert, AlertTitle, AlertDescription }
