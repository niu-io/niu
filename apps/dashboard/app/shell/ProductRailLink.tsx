import { NavLink, type NavLinkProps } from 'react-router';
import { useSidebar } from '@/components/ui/sidebar';
import { prefetchRouteIntent } from './prefetch';

export type ProductRailLinkProps = NavLinkProps & {
  onActivate?: () => void;
  disablePrefetch?: boolean;
};

export default function ProductRailLink({
  to,
  onActivate,
  disablePrefetch = false,
  children,
  onClick,
  onPointerEnter,
  onFocus,
  ...props
}: ProductRailLinkProps) {
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <NavLink
      to={to}
      {...props}
      onPointerEnter={event => {
        if (!disablePrefetch) prefetchRouteIntent(to);
        onPointerEnter?.(event);
      }}
      onFocus={event => {
        if (!disablePrefetch) prefetchRouteIntent(to);
        onFocus?.(event);
      }}
      onClick={event => {
        onActivate?.();
        onClick?.(event);
        if (!event.defaultPrevented && isMobile) setOpenMobile(false);
      }}
    >
      {children}
    </NavLink>
  );
}
