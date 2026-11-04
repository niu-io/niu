import { useLocale as useUILocale } from '@/shell/ui-locale';
import {
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import type { DashboardContext, Model } from './dashboard-context';
import { useLocale } from './ui-locale';
import { navigation } from './navigation';
import ProductRailLink from './ProductRailLink';
import WorkspaceSwitcher from './WorkspaceSwitcher';

function isWorkspaceNavItemActive(itemTo: string, activePath: string): boolean {
  if (itemTo === '.') return activePath === '.' || activePath === 'usage';
  if (itemTo === 'assets') {
    return (
      activePath === 'assets' ||
      activePath.startsWith('assets/') ||
      activePath === 'library' ||
      activePath === 'video' ||
      activePath.startsWith('video/')
    );
  }
  if (itemTo === 'settings') {
    return activePath === 'settings' || activePath === 'billing' || activePath === 'costs';
  }
  const clean = itemTo.replace(/^\/+|\/+$/g, '');
  return activePath === itemTo || activePath.startsWith(`${clean}/`);
}

export default function WorkspaceNav({
  context,
  activeWorkspacePath,
  models,
  activePath,
  onCreateWorkspace,
  creationAvailable,
}: {
  context: DashboardContext;
  activeWorkspacePath: string;
  models: Model[];
  activePath: string;
  onCreateWorkspace: () => void;
  creationAvailable: boolean;
}) {
  const { t: uiT } = useUILocale();
  const { isZh } = useLocale();
  const navItems = navigation.filter(
    item => item.destination === 'Workspace' && !item.hidden,
  );

  return (
    <>
      <SidebarHeader className="sidebar-heading">
        <WorkspaceSwitcher
          context={context}
          creationAvailable={creationAvailable}
          onCreateWorkspace={onCreateWorkspace}
        />
      </SidebarHeader>
      <SidebarContent className="workspace-sidebar-content">
        <nav aria-label={uiT("Main navigation")}>
          <SidebarMenu className="workspace-nav-menu">
            {navItems.map(item => {
              const path = item.to === '.' ? activeWorkspacePath : `${activeWorkspacePath}/${item.to}`;
              const isActive = isWorkspaceNavItemActive(item.to, activePath);
              const displayLabel = isZh ? item.labelZh : item.label;
              return (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={isActive} className="nav-item" tooltip={displayLabel}>
                    <ProductRailLink to={path} end={item.to === '.'} aria-label={displayLabel}>
                      <item.icon className="nav-icon" aria-hidden="true" />
                      <span>{displayLabel}</span>
                      {item.to === 'models' && models.length > 0 && (
                        <span className="nav-count">{models.length}</span>
                      )}
                    </ProductRailLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </nav>
      </SidebarContent>
    </>
  );
}
