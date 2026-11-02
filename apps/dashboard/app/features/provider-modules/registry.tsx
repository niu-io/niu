import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { NativeProviderModule } from '@niu-io/sdk/admin';
import { useLocale as useUILocale } from '@/shell/ui-locale';
import VolcengineView from './volcengine/VolcengineView';
import { useMaterials, type NativeMaterialsContext } from './volcengine/useMaterials';

export type { NativeMaterialsContext };

export type ProviderWorkspaceSectionRenderProps = {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  selection: NativeMaterialsContext;
  onContextChange: (next: NativeMaterialsContext) => void;
};

export type ProviderWorkspaceSectionSpec = {
  id: 'materials' | 'verification';
  moduleId: string;
  labelEn: string;
  labelZh: string;
  isAvailable: (context: { modules: NativeProviderModule[]; hasHistory: boolean }) => boolean;
  render: (props: ProviderWorkspaceSectionRenderProps) => ReactNode;
};

export type ProviderModuleRegistration = {
  id: string;
  workspaceSections: ProviderWorkspaceSectionSpec[];
  renderGenerationTools: (props: {
    toolsKey: string;
    workspaceName: string;
    modelId: string;
    keyId: string;
    module: NativeProviderModule;
  }) => ReactNode;
};

function VolcengineMaterialsSection({
  workspaceId,
  workspaceName,
  workspaceSlug,
  selection,
  onContextChange,
}: ProviderWorkspaceSectionRenderProps) {
  const { t: uiT } = useUILocale();
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {uiT(
          'Manage materials and identity verification required by your video Provider. Create videos and revisit previous results in',
        )}{' '}
        <Link
          className="underline underline-offset-4"
          to={`/generations?new=video&workspace=${encodeURIComponent(workspaceSlug)}`}
        >
          {uiT('Generations')}
        </Link>
        {uiT('. Available tools depend on the selected model.')}
      </p>
      <VolcengineView
        key={`${workspaceId}:materials`}
        initialSection="materials"
        hideSectionTabs
        selection={selection}
        onContextChange={onContextChange}
        workspaceName={workspaceName}
      />
    </div>
  );
}

function VolcengineVerificationSection({
  workspaceId,
  workspaceName,
  selection,
  onContextChange,
}: ProviderWorkspaceSectionRenderProps) {
  const { t } = useUILocale();
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t(
          'Complete real-person portrait and liveness verification required by your video Provider before using human subjects in video generation.',
          '在使用真人主体生成视频前，请先完成上游视频服务商要求的真人肖像与活体核验。',
        )}
      </p>
      <VolcengineView
        key={`${workspaceId}:verification`}
        initialSection="verification"
        hideSectionTabs
        selection={selection}
        onContextChange={onContextChange}
        workspaceName={workspaceName}
      />
    </div>
  );
}

const PROVIDER_MODULE_REGISTRY: ReadonlyMap<string, ProviderModuleRegistration> = new Map([
  [
    'volcengine',
    {
      id: 'volcengine',
      workspaceSections: [
        {
          id: 'materials',
          moduleId: 'volcengine',
          labelEn: 'Provider materials',
          labelZh: '上游素材组',
          isAvailable: ({ modules, hasHistory }) =>
            modules.some(m => m.materials?.groups || m.materials?.assets) || hasHistory,
          render: props => <VolcengineMaterialsSection {...props} />,
        },
        {
          id: 'verification',
          moduleId: 'volcengine',
          labelEn: 'Real-person verification',
          labelZh: '真人主体核验',
          isAvailable: ({ modules }) => modules.some(m => m.human_verification),
          render: props => <VolcengineVerificationSection {...props} />,
        },
      ],
      renderGenerationTools: ({ toolsKey, workspaceName, modelId, keyId }) => (
        <VolcengineView
          key={toolsKey}
          workspaceName={workspaceName}
          model={modelId}
          nativeContext={{ keyId, model: modelId }}
        />
      ),
    },
  ],
]);

export function getRegisteredProviderModule(
  moduleId: string,
): ProviderModuleRegistration | undefined {
  return PROVIDER_MODULE_REGISTRY.get(moduleId);
}

export function findSupportedProviderModule(
  modules: readonly NativeProviderModule[],
  modelAlias: string,
): NativeProviderModule | undefined {
  return modules.find(
    candidate =>
      candidate.model_alias === modelAlias && PROVIDER_MODULE_REGISTRY.has(candidate.module),
  );
}

export function ProviderGenerationTools(props: {
  toolsKey: string;
  workspaceName: string;
  modelId: string;
  keyId: string;
  module: NativeProviderModule;
}) {
  const registration = PROVIDER_MODULE_REGISTRY.get(props.module.module);
  if (!registration) return null;
  return <>{registration.renderGenerationTools(props)}</>;
}

/**
 * Discovers which provider extension sections (if any) are available in the
 * active workspace so core Workspace Assets only mounts provider tabs on demand.
 */
export function useWorkspaceProviderAssetSections(
  selection: NativeMaterialsContext,
  requestedTab?: string | null,
) {
  const data = useMaterials(undefined, undefined, selection);
  const discoveredModules = data.contextChoices.map(choice => choice.module);
  const hasHistory = Object.values(data.historyModels).some(models => models.length > 0);

  const sections: ProviderWorkspaceSectionSpec[] = [];
  for (const registration of PROVIDER_MODULE_REGISTRY.values()) {
    const moduleMatches = discoveredModules.filter(m => m.module === registration.id);
    for (const section of registration.workspaceSections) {
      const explicitlyRequested = requestedTab === section.id;
      if (
        explicitlyRequested ||
        section.isAvailable({
          modules: moduleMatches,
          hasHistory,
        })
      ) {
        sections.push(section);
      }
    }
  }

  return {
    loading: data.discoveryLoading,
    sections,
  };
}
