import * as React from "react"

// Match the shell breakpoint where the persistent product rail disappears.
const MOBILE_BREAKPOINT = 641

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    window.addEventListener("resize", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => {
      mql.removeEventListener("change", onChange)
      window.removeEventListener("resize", onChange)
    }
  }, [])

  return !!isMobile
}
