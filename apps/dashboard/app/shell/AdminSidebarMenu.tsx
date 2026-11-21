import { useEffect, useState } from 'react';
import { IconCheck, IconChevronRight } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  isAdminNavGroupActive,
  isAdminNavItemActive,
  type AdminNavGroup,
} from './admin-navigation';
import ProductRailLink from './ProductRailLink';
import { useLocale } from './ui-locale';

const COLLAPSED_STORAGE_KEY = 'niu.admin.nav.collapsed';

function readCollapsedGroups(): Set<string> {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((entry): entry is string => typeof entry === 'string'));
  } catch {
    return new Set();
  }
}

function writeCollapsedGroups(collapsed: Set<string>) {
  try {
    if (collapsed.size === 0) {
      window.localStorage.removeItem(COLLAPSED_STORAGE_KEY);
    } else {
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify([...collapsed]));
    }
  } catch {
    /* Storage is optional. */
  }
}

export function AdminSidebarMenu({
  groups,
  pathname,
  pendingRegistrations = 0,
  menuClassName,
}: {
  groups: AdminNavGroup[];
  pathname: string;
  pendingRegistrations?: number;
  menuClassName?: string;
}) {
  const { isZh } = useLocale();
  const { isMobile, state } = useSidebar();
  const iconOnly = !isMobile && state === 'collapsed';
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    const initial = readCollapsedGroups();
    for (const group of groups) {
      if (group.labelEn && isAdminNavGroupActive(group, pathname)) {
        initial.delete(group.id);
      }
    }
    return initial;
  });

  // Automatically expand the active group when navigating directly to one of its routes.
  useEffect(() => {
    setCollapsedGroups(current => {
      let changed = false;
      const next = new Set(current);
      for (const group of groups) {
        if (group.labelEn && isAdminNavGroupActive(group, pathname) && next.has(group.id)) {
          next.delete(group.id);
          changed = true;
        }
      }
      if (!changed) return current;
      writeCollapsedGroups(next);
      return next;
    });
  }, [groups, pathname]);

  const setGroupOpen = (groupId: string, open: boolean) => {
    setCollapsedGroups(current => {
      const next = new Set(current);
      if (open) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      writeCollapsedGroups(next);
      return next;
    });
  };

  const badgeCountFor = (badgeKey?: 'pendingRegistrations') =>
    badgeKey === 'pendingRegistrations' ? pendingRegistrations : 0;

  return (
    <SidebarGroup className="px-1 py-1 group-data-[collapsible=icon]:px-0">
      <SidebarGroupContent>
        <SidebarMenu className={menuClassName}>
          {groups.map(group => {
            if (!group.labelEn) {
              return group.items.map(item => {
                const label = isZh ? item.labelZh : item.labelEn;
                const active = isAdminNavItemActive(item, pathname);
                const badgeCount = badgeCountFor(item.badgeKey);
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton asChild isActive={active} tooltip={label}>
                      <ProductRailLink to={item.to} end={item.end} aria-label={label}>
                        <item.icon aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{label}</span>
                        {badgeCount > 0 && (
                          <Badge
                            variant="default"
                            className="ml-auto h-5 min-w-5 justify-center px-1.5 text-[11px] group-data-[collapsible=icon]:hidden"
                          >
                            {badgeCount}
                          </Badge>
                        )}
                      </ProductRailLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              });
            }

            const groupLabel = isZh ? (group.labelZh ?? group.labelEn) : group.labelEn;
            const GroupIcon = group.icon ?? group.items[0].icon;
            const groupActive = isAdminNavGroupActive(group, pathname);
            const groupBadgeCount = group.items.reduce(
              (total, item) => total + badgeCountFor(item.badgeKey),
              0,
            );

            if (iconOnly) {
              return (
                <SidebarMenuItem key={group.id}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton
                        type="button"
                        isActive={groupActive}
                        tooltip={groupLabel}
                        aria-label={groupLabel}
                      >
                        <GroupIcon aria-hidden="true" />
                        <span className="sr-only">{groupLabel}</span>
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="right" align="start" sideOffset={8} className="min-w-48">
                      <DropdownMenuLabel>{groupLabel}</DropdownMenuLabel>
                      {group.items.map(item => {
                        const label = isZh ? item.labelZh : item.labelEn;
                        const active = isAdminNavItemActive(item, pathname);
                        const badgeCount = badgeCountFor(item.badgeKey);
                        return (
                          <DropdownMenuItem key={item.to} asChild>
                            <ProductRailLink to={item.to} end={item.end}>
                              <item.icon className="size-4 shrink-0" aria-hidden="true" />
                              <span className="min-w-0 flex-1 truncate">{label}</span>
                              {badgeCount > 0 && (
                                <Badge variant="default" className="h-5 min-w-5 justify-center px-1.5 text-[11px]">
                                  {badgeCount}
                                </Badge>
                              )}
                              {active && <IconCheck className="ml-auto size-4 shrink-0" aria-hidden="true" />}
                            </ProductRailLink>
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              );
            }

            const isOpen = !collapsedGroups.has(group.id);
            return (
              <Collapsible
                key={group.id}
                asChild
                open={isOpen}
                onOpenChange={open => setGroupOpen(group.id, open)}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      type="button"
                      isActive={!isOpen && groupActive}
                      tooltip={groupLabel}
                    >
                      <GroupIcon aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{groupLabel}</span>
                      {!isOpen && groupBadgeCount > 0 && (
                        <Badge
                          variant="default"
                          className="h-5 min-w-5 justify-center px-1.5 text-[11px] group-data-[collapsible=icon]:hidden"
                        >
                          {groupBadgeCount}
                        </Badge>
                      )}
                      <IconChevronRight
                        className="ml-auto size-4 shrink-0 text-sidebar-foreground/60 transition-transform duration-150 group-data-[state=open]/collapsible:rotate-90 group-data-[collapsible=icon]:hidden"
                        aria-hidden="true"
                      />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {group.items.map(item => {
                        const label = isZh ? item.labelZh : item.labelEn;
                        const active = isAdminNavItemActive(item, pathname);
                        const badgeCount = badgeCountFor(item.badgeKey);
                        return (
                          <SidebarMenuSubItem key={item.to}>
                            <SidebarMenuSubButton asChild isActive={active}>
                              <ProductRailLink to={item.to} end={item.end} aria-label={label}>
                                <item.icon aria-hidden="true" />
                                <span className="min-w-0 flex-1 truncate">{label}</span>
                                {badgeCount > 0 && (
                                  <Badge
                                    variant="default"
                                    className="ml-auto h-5 min-w-5 justify-center px-1.5 text-[11px]"
                                  >
                                    {badgeCount}
                                  </Badge>
                                )}
                              </ProductRailLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
