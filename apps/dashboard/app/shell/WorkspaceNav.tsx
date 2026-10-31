import {
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useWorkspaceVideo } from '@/features/provider-modules/useWorkspaceVideo';
import type { DashboardContext, Model } from './dashboard-context';
import { useLocale } from './locale';
import { navigation } from './navigation';
import ProductRailLink from './ProductRailLink';
import WorkspaceSwitcher from './WorkspaceSwitcher';

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
  const { isZh } = useLocale();
  const videoAvailable = useWorkspaceVideo(context);
  const navItems = navigation.filter(
    item =>
      item.destination === 'Workspace' &&
      (item.to !== 'video' || videoAvailable) &&
      (item.to !== 'costs' || context.session?.kind === 'installation'),
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
        <nav aria-label="Main navigation">
          <SidebarMenu className="workspace-nav-menu">
            {navItems.map(item => {
              const path = item.to === '.' ? activeWorkspacePath : `${activeWorkspacePath}/${item.to}`;
              const isActive =
                item.to === '.'
                  ? activePath === '.'
                  : activePath === item.to ||
                    activePath.startsWith(`${item.to.replace(/^\/+|\/+$/g, '')}/`);
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
