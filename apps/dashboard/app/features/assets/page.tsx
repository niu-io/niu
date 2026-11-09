import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorkspaceLibrary } from '@/features/library/page';
import { useWorkspaceProviderAssetSections } from '@/features/provider-modules/registry';
import { useDashboardContext } from '@/shell/dashboard-context';
import { useLocale, useLocale as useUILocale } from '@/shell/ui-locale';
import { workspaceDisplayName, workspacePathSegment } from '@/shell/workspace-route';
import { IconSparkles } from '@tabler/icons-react';

export default function WorkspaceAssetsRoute() {
  const { t: uiT } = useUILocale();
  const { t } = useLocale();
  const { token, workspace, session, workspaces } = useDashboardContext();
  const { section } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const pathMatch = /^\/workspaces\/[^/]+\/assets\/([^/?#]+)\/?$/.exec(location.pathname);
  const pathSection = section ?? (pathMatch ? decodeURIComponent(pathMatch[1]) : null);
  const requestedTab = pathSection ?? search.get('tab');
  const selection = { keyId: search.get('key') ?? '', model: search.get('model') ?? '' };
  const { sections: extensionSections } = useWorkspaceProviderAssetSections(selection, requestedTab);

  if (!token || !workspace) {
    return (
      <>
        <PageHeader title={t('Assets', '素材库')} />
        <Empty className="min-h-44 rounded-xl border border-dashed border-border/60 bg-muted/20 py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconSparkles size={18} aria-hidden="true" />
            </EmptyMedia>
            <EmptyDescription>{uiT('Select a workspace to see saved media.')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </>
    );
  }

  const workspaceSlug = workspacePathSegment(workspace, workspaces ?? [workspace]);
  const matchedExtension = extensionSections.find(ext => ext.id === requestedTab);
  const activeTab = matchedExtension ? matchedExtension.id : 'workspace';

  const selectContext = (next: { keyId: string; model: string }) => {
    const query = new URLSearchParams(search);
    if (next.keyId) query.set('key', next.keyId);
    else query.delete('key');
    if (next.model) query.set('model', next.model);
    else query.delete('model');
    navigate({
      pathname: location.pathname,
      search: query.size ? `?${query}` : '',
      hash: location.hash,
    });
  };

  function handleTabChange(nextTab: string) {
    const query = new URLSearchParams(search);
    query.delete('tab');
    navigate({
      pathname: nextTab === 'workspace'
        ? `/workspaces/${workspaceSlug}/assets`
        : `/workspaces/${workspaceSlug}/assets/${encodeURIComponent(nextTab)}`,
      search: query.size ? `?${query}` : '',
    });
  }

  const libraryElement = (
    <WorkspaceLibrary
      key={`${token}:${workspace.id}:${session?.permissions.write}`}
      token={token}
      scope={{ organizationId: workspace.organization_id, projectId: workspace.id }}
      canWrite={Boolean(session?.permissions.write)}
      workspaceSlug={workspaceSlug}
    />
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('Assets', '素材库')}
        action={
          <Button asChild variant="outline">
            <Link to={`/generations?new=video&workspace=${encodeURIComponent(workspaceSlug)}`}>
              <IconSparkles size={16} aria-hidden="true" />
              <span>{t('Create video', '生成视频')}</span>
            </Link>
          </Button>
        }
      />
      {extensionSections.length === 0 ? (
        libraryElement
      ) : (
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList variant="line">
            <TabsTrigger value="workspace">{t('Workspace media', '工作空间素材')}</TabsTrigger>
            {extensionSections.map(ext => (
              <TabsTrigger key={ext.id} value={ext.id}>
                {t(ext.labelEn, ext.labelZh)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="workspace">{libraryElement}</TabsContent>
          {extensionSections.map(ext => (
            <TabsContent key={ext.id} value={ext.id}>
              {ext.render({
                workspaceId: workspace.id,
                workspaceName: workspaceDisplayName(workspace.name),
                workspaceSlug,
                selection,
                onContextChange: selectContext,
              })}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
