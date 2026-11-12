import { NavLink, useLocation, useResolvedPath, type NavLinkProps } from 'react-router';
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
  const location = useLocation();
  const resolved = useResolvedPath(to);
  const isSameDestination =
    resolved.pathname === location.pathname &&
    resolved.search === location.search &&
    resolved.hash === location.hash;

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
        if (!event.defaultPrevented && isMobile && isSameDestination) {
          window.requestAnimationFrame(() => setOpenMobile(false));
        }
      }}
    >
      {children}
    </NavLink>
  );
}
