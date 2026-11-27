import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import PageHeader, { PageHeaderTabsTargetContext } from '@/components/PageHeader';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

function collectTsxFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsxFiles(full));
    } else if (entry.name.endsWith('.tsx')) {
      results.push(full);
    }
  }
  return results;
}

describe('Shared UI primitives layout safeguards', () => {
  const appDir = resolve(process.cwd(), 'app');
  const tsxFiles = collectTsxFiles(appDir);

  it('keeps per-workspace charge headers and values visible on phones', () => {
    const source = readFileSync(join(appDir, 'features/activity/global-page.tsx'), 'utf8');
    const section = source.split('<section aria-label={uiT("Activity by workspace")}')[1].split('</section>')[0];
    for (const tag of ['TableHead', 'TableCell']) {
      const cells = [...section.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'g'))];
      expect(cells.at(-1)?.[1]).toContain('whitespace-normal');
      expect(cells.at(-1)?.[1]).not.toContain('hidden');
    }
  });

  it('keeps Empty placeholders card-free, spacious, and auto-centered on full-page routes', () => {
    const { container } = render(
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon" />
          <EmptyTitle>尚未配置工作空间护栏策略</EmptyTitle>
          <EmptyDescription>为当前工作空间的所有 API 密钥统一配置模型限制、内容过滤及外部检测规则。</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>Actions</EmptyContent>
      </Empty>,
    );
    const root = container.querySelector('[data-slot="empty"]') as HTMLElement;
    const header = container.querySelector('[data-slot="empty-header"]') as HTMLElement;
    const title = container.querySelector('[data-slot="empty-title"]') as HTMLElement;
    const desc = container.querySelector('[data-slot="empty-description"]') as HTMLElement;
    const content = container.querySelector('[data-slot="empty-content"]') as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.className).not.toContain('bg-card');
    expect(root.className).not.toContain('radius-panel');
    expect(root.className).toContain('w-full');
    expect(root.className).toContain('gap-5');
    expect(header.className).toContain('max-w-xl');
    expect(title.className).toContain('text-base');
    expect(title.className).toContain('leading-snug');
    expect(desc.className).toContain('max-w-[36rem]');
    expect(desc.className).toContain('leading-relaxed');
    expect(desc.className).toContain('text-balance');
    expect(content.className).toContain('max-w-xl');
    expect(content.className).not.toContain('max-w-sm');
    const surfaces = readFileSync(resolve(process.cwd(), 'app/styles/surfaces.css'), 'utf8');
    expect(surfaces).toContain('.page-content > .gateway-route-content > div > :has(> [data-slot="empty"])');
    expect(surfaces).not.toContain('.guardrails-page:has(> .guardrails-empty) { display: flex; flex: 0 0 auto;');
    const guardrails = readFileSync(join(appDir, 'features/guardrails/page.tsx'), 'utf8');
    expect(guardrails).toContain('guardrails-page empty-region');
    const assets = readFileSync(join(appDir, 'features/assets/page.tsx'), 'utf8');
    expect(assets).not.toContain('<div className="space-y-5">');
    const library = readFileSync(join(appDir, 'features/library/page.tsx'), 'utf8');
    expect(library).not.toContain('min-h-64');
    expect(guardrails).not.toContain('min-h-[min(56dvh,28rem)]');
  });

  it('forbids card-styled Empty overrides across the entire dashboard app', () => {
    const violations: string[] = [];
    const pattern = /<Empty\b[^>]*(?:bg-card|bg-muted|rounded-xl|rounded-2xl|radius-panel|shadow)/g;
    for (const file of tsxFiles) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(pattern)) {
        const line = source.slice(0, match.index ?? 0).split('\n').length;
        violations.push(`${relative(appDir, file)}:${line}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('uses CJK-safe line height on Label instead of leading-none', () => {
    const { container } = render(<Label htmlFor="field">模型访问权限</Label>);
    const label = container.querySelector('[data-slot="label"]') as HTMLElement;
    expect(label).toBeTruthy();
    expect(label.className).not.toContain('leading-none');
    expect(label.className).toContain('leading-snug');
  });

  it('forbids leading-none overrides on Label across the entire dashboard app', () => {
    const violations: string[] = [];
    const pattern = /<Label\b[^>]*leading-none/g;
    for (const file of tsxFiles) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(pattern)) {
        const line = source.slice(0, match.index ?? 0).split('\n').length;
        violations.push(`${relative(appDir, file)}:${line}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('retains the global zero-specificity field-spacing safeguard in foundation.css', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/styles/foundation.css'), 'utf8');
    expect(css).toContain(':has(> [data-slot="label"]:not(.sr-only))');
    expect(css).toContain('gap: 0.5rem');
  });

  it('keeps the Models catalog as a spacious responsive multi-column card grid instead of cramped cards or a single-column stack', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/features/models/models.css'), 'utf8');
    const block = css.match(/\.models-cards\s*\{[^}]*\}/)?.[0] ?? '';
    expect(block).toContain('display: grid');
    expect(block).toMatch(/grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(/);
    const minPxMatch = block.match(/(\d+)px/);
    expect(Number(minPxMatch?.[1] ?? 0)).toBeGreaterThanOrEqual(340);
    expect(block).not.toContain('flex-direction: column');
    const skeletons = readFileSync(join(appDir, 'components/PageSkeletons.tsx'), 'utf8');
    expect(skeletons).toContain('minmax(min(100%,352px),1fr)');
  });

  it('uses distinct brand-tinted fallback surface tokens on AvatarFallback instead of bg-muted', () => {
    const { container } = render(
      <Avatar>
        <AvatarFallback>D</AvatarFallback>
      </Avatar>,
    );
    const fallback = container.querySelector('[data-slot="avatar-fallback"]') as HTMLElement;
    expect(fallback).toBeTruthy();
    expect(fallback.className).toContain('--avatar-brand-bg');
    expect(fallback.className).toContain('--avatar-brand-fg');
    expect(fallback.className).not.toContain('bg-muted');
  });

  it('reserves room for the current breadcrumb in narrow headers', () => {
    const css = readFileSync(join(appDir, 'styles/surfaces.css'), 'utf8');
    expect(css).toContain('[data-slot="breadcrumb-item"]:last-child { flex: 1 0 auto;');
    expect(css).toContain('[data-slot="breadcrumb-item"]:only-child { max-width: 100%; }');
  });

  it('offers recovery when an audit category or search yields no matches', () => {
    const source = readFileSync(join(appDir, 'features/audit-logs/page.tsx'), 'utf8');
    expect(source).toContain("const filtered = category !== 'all' || Boolean(query.trim())");
    expect(source).toContain('filtered && <EmptyContent>');
    expect(source).toContain('searchInput.current?.focus()');
  });

  it('keeps the key directory as a responsive list instead of a fixed-width table', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/styles/operations.css'), 'utf8');
    const keys = readFileSync(join(appDir, 'features/keys/components/KeysView.tsx'), 'utf8');
    expect(keys).not.toMatch(/className="header-icon-action"[^>]+aria-label=\{uiT\("New key"\)/);
    expect(css).toContain('.key-rows {');
    expect(css).toContain('.key-row-facts {');
    expect(css).toContain('@media (max-width: 900px)');
    expect(css).not.toContain('.key-table');
    expect(keys).toContain('<ul className="key-rows">');
    expect(keys).not.toContain('key-table');
  });

  it('caps bar width across every Recharts Bar in the dashboard so single-bucket data never fills the canvas', () => {
    const violations: string[] = [];
    const pattern = /<Bar\b[^>]*>/g;
    for (const file of tsxFiles) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(pattern)) {
        if (!/maxBarSize=/.test(match[0])) {
          const line = source.slice(0, match.index ?? 0).split('\n').length;
          violations.push(`${relative(appDir, file)}:${line}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('portals top-level PageHeader tabs into #dashboard-page-tabs and falls back inline when nested', () => {
    const host = document.createElement('div');
    host.id = 'dashboard-page-tabs';
    document.body.appendChild(host);
    try {
      const { container, unmount } = render(
        <Tabs value="customers">
          <PageHeader
            title="Customers"
            tabs={
              <TabsList variant="line">
                <TabsTrigger value="customers">Customers</TabsTrigger>
                <TabsTrigger value="registrations">Registrations</TabsTrigger>
              </TabsList>
            }
          />
        </Tabs>,
      );
      expect(host.querySelector('[data-slot="tabs-list"]')).toBeTruthy();
      expect(host.textContent).toContain('Registrations');
      expect(container.querySelector('[data-slot="tabs-list"]')).toBeNull();
      unmount();

      const nested = render(
        <PageHeaderTabsTargetContext.Provider value="">
          <Tabs value="gateways">
            <PageHeader
              title="Payments"
              tabs={
                <TabsList variant="line">
                  <TabsTrigger value="gateways">Payment gateways</TabsTrigger>
                  <TabsTrigger value="bank">Bank transfer</TabsTrigger>
                </TabsList>
              }
            />
          </Tabs>
        </PageHeaderTabsTargetContext.Provider>,
      );
      expect(host.querySelector('[data-slot="tabs-list"]')).toBeNull();
      expect(nested.container.querySelector('[data-slot="tabs-list"]')).toBeTruthy();
      nested.unmount();
    } finally {
      host.remove();
    }
  });

  it('replaces redundant static header titles with PageHeader tabs on top-level tabbed Admin pages', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/styles/surfaces.css'), 'utf8');
    expect(css).toContain('.dashboard-page-header:has(.dashboard-page-tabs:not(:empty)) .breadcrumbs');
    for (const rel of [
      'features/customers/customer-directory.tsx',
      'features/platform-settings/page.tsx',
      'features/incidents/page.tsx',
      'features/retail-pricing/page.tsx',
      'features/assets/page.tsx',
    ]) {
      const source = readFileSync(join(appDir, rel), 'utf8');
      expect(source, `${rel} should pass primary section tabs into PageHeader`).toMatch(/<PageHeader[\s\S]*?tabs=/);
    }
  });

  it('prevents direct-child dialog buttons from stretching full width and keeps pricing history notes labeled', () => {
    const foundation = readFileSync(resolve(process.cwd(), 'app/styles/foundation.css'), 'utf8');
    expect(foundation).toContain(':where([data-slot="dialog-content"]) > :where([data-slot="button"]:not([data-slot="dialog-close"]))');
    expect(foundation).toContain('justify-self: start');
    const retailPage = readFileSync(join(appDir, 'features/retail-pricing/page.tsx'), 'utf8');
    expect(retailPage).toContain('Publication note:');
    expect(retailPage).not.toMatch(/<\/DialogHeader>\s*<Button[^>]*>[^<]*Refresh history/);
  });

  it('enforces the two-tab Provider detail (Configuration | Analytics), default-collapsed model policy, and zero Provider member UI', () => {
    const shellSections = readFileSync(join(appDir, 'shell/ShellSections.tsx'), 'utf8');
    expect(shellSections).not.toMatch(/\['members',\s*t\(/);
    expect(shellSections).toContain("['config', t('Configuration', '配置')]");
    expect(shellSections).toContain("['usage', t('Analytics', '统计')]");
    const providerSettings = readFileSync(join(appDir, 'features/provider-business/ProviderSettings.tsx'), 'utf8');
    expect(providerSettings).not.toContain('../members');
    expect(providerSettings).not.toContain('Provider members');
    const providerAdmin = readFileSync(join(appDir, 'features/provider-business/admin.tsx'), 'utf8');
    expect(providerAdmin).not.toContain('/members');
    expect(providerAdmin).not.toContain('Manage Provider membership');
    expect(providerAdmin).not.toContain('No Provider members');
    const providerConfig = readFileSync(join(appDir, 'features/provider-business/ProviderConfigurationPage.tsx'), 'utf8');
    expect(providerConfig).toContain('<ProviderSettings');
    expect(providerConfig).toContain('<ProvidersView');
    expect(providerConfig).toContain('<ProviderModelPolicySection');
    const providerList = readFileSync(join(appDir, 'features/providers/ProviderList.tsx'), 'utf8');
    expect(providerList).not.toMatch(/API keys, (?:models|offers), or members/);
  });

  it('distinguishes unconfigured Pending setup (API key not configured) from disabled API keys across Provider surfaces', () => {
    const providerSetup = readFileSync(join(appDir, 'features/providers/provider-setup.ts'), 'utf8');
    expect(providerSetup).toContain('configured_api_keys');
    expect(providerSetup).toContain("label: 'Pending setup'");
    expect(providerSetup).toContain("detail: 'API key not configured.'");
    expect(providerSetup).not.toContain('No API key connected.');
    const providerModels = readFileSync(join(appDir, 'features/provider-business/ProviderModels.tsx'), 'utf8');
    expect(providerModels).toContain('connection.has_credential');
    const policySection = readFileSync(join(appDir, 'features/provider-business/ProviderModelPolicySection.tsx'), 'utf8');
    expect(policySection).toContain('connection.has_credential');
  });
  it('enforces unmistakable brand-tinted aria-pressed active state on shared Button choice/toggle controls', () => {
    const foundation = readFileSync(resolve(process.cwd(), 'app/styles/foundation.css'), 'utf8');
    expect(foundation).toContain('--choice-active-bg:');
    expect(foundation).toContain('--choice-active-fg:');
    expect(foundation).toContain('--choice-active-border:');
    const button = readFileSync(join(appDir, 'components/ui/button.tsx'), 'utf8');
    expect(button).toContain('aria-[pressed=true]:border-[var(--choice-active-border)]');
    expect(button).toContain('aria-[pressed=true]:bg-[var(--choice-active-bg)]');
    expect(button).toContain('aria-[pressed=true]:text-[var(--choice-active-fg)]');
    const customerShared = readFileSync(join(appDir, 'features/customers/create-company.tsx'), 'utf8');
    expect(customerShared).toContain('aria-pressed={!trimmedTrial}');
    expect(customerShared).toContain('aria-pressed={trimmedTrial === preset}');
    expect(customerShared).not.toContain("variant={!trialAmount.trim() ? 'secondary' : 'outline'}");
  });
  it('reserves Not published (未发布) for uncallable commercial models, uses concise Try (试用) on model cards, and never stamps Capabilities not published (能力未发布)', () => {
    const modelTable = readFileSync(join(appDir, 'features/models/components/ModelTable.tsx'), 'utf8');
    expect(modelTable).not.toContain('Capabilities not published');
    expect(modelTable).not.toContain('capabilities have not been published');
    expect(modelTable).not.toContain('Try in Chat');
    expect(modelTable).not.toContain('Try in Video');
    expect(modelTable).not.toContain('Open Generations');
    expect(modelTable).toContain('uiT("Not published")');
    expect(modelTable).toContain('uiT("Try")');
  });
  it('prevents fixed-layout table cells from bleeding text over adjacent columns and keeps bare table rules inside @layer base', () => {
    const foundation = readFileSync(resolve(process.cwd(), 'app/styles/foundation.css'), 'utf8');
    expect(foundation).toContain(':where(table.table-fixed, .billing-transactions, .billing-invoices, .gateway-request-table, .activity-charge-breakdown table, .operator-session-table table) :where(th, td)');
    expect(foundation).toContain('text-overflow: ellipsis');
    const shell = readFileSync(resolve(process.cwd(), 'app/styles/shell.css'), 'utf8');
    expect(shell).not.toMatch(/^\s*(?:th|td)\s*\{/m);
  });
  it('enforces vertical rhythm on flex-column detail surfaces, CJK-safe title leading, and zero negative top margins on global intros/alerts', () => {
    const catalog = readFileSync(resolve(process.cwd(), 'app/styles/catalog.css'), 'utf8');
    expect(catalog).toMatch(/\.model-route-detail\s*\{[^}]*gap:\s*[1-9]\d*px;/);
    const foundation = readFileSync(resolve(process.cwd(), 'app/styles/foundation.css'), 'utf8');
    expect(foundation).toContain('> :where(p) + :where([data-slot="button"]) { margin-top: 0.75rem; }');
    const card = readFileSync(join(appDir, 'components/ui/card.tsx'), 'utf8');
    const dialog = readFileSync(join(appDir, 'components/ui/dialog.tsx'), 'utf8');
    expect(card).not.toContain('leading-none');
    expect(dialog).not.toContain('leading-none');
    const surfaces = readFileSync(resolve(process.cwd(), 'app/styles/surfaces.css'), 'utf8');
    const overview = readFileSync(resolve(process.cwd(), 'app/styles/overview.css'), 'utf8');
    expect(surfaces).not.toMatch(/\.provider-intro\s*\{[^}]*margin:\s*-/);
    expect(overview).not.toMatch(/\.operator-error\s*\{[^}]*margin:\s*-/);
  });

  it('promotes ShellSectionTabs into #dashboard-page-tabs without stacking nested tab bars inside Guardrails or detail routes', () => {
    const shellSectionTabs = readFileSync(join(appDir, 'shell/ShellSectionTabs.tsx'), 'utf8');
    expect(shellSectionTabs).toContain("document.getElementById('dashboard-page-tabs')");
    expect(shellSectionTabs).toContain('createPortal(');
    expect(shellSectionTabs).toContain('models|routing|evaluations)\\/?$');
    expect(shellSectionTabs).toContain('settings|guardrails|events)\\/?$');
    for (const rel of [
      'features/guardrails/page.tsx',
      'features/platform-settings/registration-review.tsx',
      'features/branding/page.tsx',
      'features/platform/page.tsx',
    ]) {
      const source = readFileSync(join(appDir, rel), 'utf8');
      expect(source, `${rel} must not render a second stacked <TabsList>`).not.toContain('<TabsList');
    }
    const assetsPage = readFileSync(join(appDir, 'features/assets/page.tsx'), 'utf8');
    expect(assetsPage).toContain('tabs={');
    expect(assetsPage).toContain('<TabsList variant="line"');
    const shellCss = readFileSync(resolve(process.cwd(), 'app/styles/shell.css'), 'utf8');
    expect(shellCss).toContain('.dashboard-page-header { position: sticky; top: 0; z-index: 18; display: flex; flex: 0 0 var(--dashboard-header-height); min-height: var(--dashboard-header-height); align-items: center; gap: 10px; padding-block: 0;');
  });

  it('uses one page-gutter token for header tabs and page content, and wraps tabs below the desktop rail breakpoint', () => {
    const surfaces = readFileSync(resolve(process.cwd(), 'app/styles/surfaces.css'), 'utf8');
    const shell = readFileSync(resolve(process.cwd(), 'app/styles/shell.css'), 'utf8');
    const foundation = readFileSync(resolve(process.cwd(), 'app/styles/foundation.css'), 'utf8');
    expect(surfaces).toContain('--page-gutter: 32px');
    expect(surfaces).toContain('padding-inline: var(--page-gutter)');
    expect(surfaces).toContain('@media (max-width: 1100px) { .app-shell { --page-gutter: 24px; } }');
    expect(surfaces).toContain('@media (max-width: 580px) { .app-shell { --page-gutter: 16px; } }');
    expect(surfaces).toContain('@media (max-width: 959px)');
    expect(surfaces).toContain('.dashboard-page-header:has(.dashboard-page-tabs:not(:empty)) .dashboard-page-tabs { order: 10; flex: 1 0 100%;');
    expect(shell).toContain('.page-content { width: 100%; max-width: none; flex: 1 0 auto; margin: 0; padding-block: 24px 72px; }');
    expect(foundation).not.toMatch(/\.page-content\s*\{[^}]*padding:/);
  });

  it('reveals the selected header tab after portal selection and strip resize without moving focus', () => {
    const shell = readFileSync(join(appDir, 'shell/ShellHeader.tsx'), 'utf8');
    const start = shell.indexOf('function revealSelectedTab');
    const effect = shell.slice(start, shell.indexOf('}, []);', start));
    expect(effect).toContain('aria-selected="true"');
    expect(effect).toContain('new MutationObserver(revealSelectedTab)');
    expect(effect).toContain('new ResizeObserver(revealSelectedTab)');
    expect(effect).toContain('host.scrollLeft');
    expect(effect).not.toMatch(/scrollIntoView|\.focus\(/);
  });

  it('keeps dialog framing, bounded scroll, and close affordances in the shared primitive', () => {
    const dialog = readFileSync(join(appDir, 'components/ui/dialog.tsx'), 'utf8');
    const foundation = readFileSync(resolve(process.cwd(), 'app/styles/foundation.css'), 'utf8');
    expect(dialog).toContain('max-h-[90dvh]');
    expect(dialog).toContain('overflow-y-auto');
    expect(dialog).toContain('overscroll-contain');
    expect(dialog).toContain('leading-snug');
    expect(dialog).toContain('size-8 items-center justify-center rounded-md');
    expect(foundation).toContain(':has(> [data-slot="dialog-close"])) > :where([data-slot="dialog-header"])');
    const setup = readFileSync(join(appDir, 'features/customers/setup.tsx'), 'utf8');
    const library = readFileSync(join(appDir, 'features/library/page.tsx'), 'utf8');
    expect(setup).not.toMatch(/<DialogTitle[^>]*pr-/);
    expect(library).not.toMatch(/<DialogTitle[^>]*pr-/);
  });

  it('keeps chart legend labels on a CJK-safe line height', () => {
    const chart = readFileSync(join(appDir, 'components/ui/chart.tsx'), 'utf8');
    const activity = readFileSync(join(appDir, 'features/executions/components/ActivityCharts.tsx'), 'utf8');
    expect(chart).not.toContain('leading-none');
    expect(activity).not.toContain('leading-none');
  });

  it('keeps the default bounded dialog frame in DialogContent instead of repeating it at call sites', () => {
    const violations: string[] = [];
    for (const file of tsxFiles) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/<DialogContent\b[\s\S]*?>/g)) {
        if (match[0].includes('max-h-[90dvh]') && match[0].includes('overflow-y-auto')) {
          const line = source.slice(0, match.index ?? 0).split('\n').length;
          violations.push(`${relative(appDir, file)}:${line}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('resolves PageHeader and ShellSectionTabs portal hosts after hydration and renders one billing tab strip', () => {
    const pageHeader = readFileSync(join(appDir, 'components/PageHeader.tsx'), 'utf8');
    const sectionTabs = readFileSync(join(appDir, 'shell/ShellSectionTabs.tsx'), 'utf8');
    expect(pageHeader).toContain('useState<HTMLElement | null>(null)');
    expect(sectionTabs).toContain('useState<HTMLElement | null>(null)');
    expect(pageHeader).not.toContain("typeof document !== 'undefined' && actionsTargetId");
    expect(sectionTabs).not.toContain("typeof document !== 'undefined' ? document.getElementById('dashboard-page-tabs')");
    const billing = readFileSync(join(appDir, 'features/billing/page.tsx'), 'utf8');
    expect(billing).not.toContain('hasShellHeaderTabs');
    expect(billing).not.toContain('<TabsList');
  });

  it('scopes Provider API key forms, icons, and integrations without cross-brand OpenRouter defaults', () => {
    const providerEditor = readFileSync(join(appDir, 'features/providers/components/ProviderEditor.tsx'), 'utf8');
    const providersView = readFileSync(join(appDir, 'features/providers/components/ProvidersView.tsx'), 'utf8');
    const integrationSettings = readFileSync(join(appDir, 'features/providers/components/IntegrationSettings.tsx'), 'utf8');

    expect(providerEditor).not.toContain("activeConnection?.adapter ?? 'openrouter'");
    expect(providerEditor).not.toContain('<IntegrationSettings');
    expect(providerEditor).toContain('!activeConnection && !isScopedToProvider');
    expect(providerEditor).toContain('allowOpenRouterAdapter');
    expect(providersView).not.toContain('<ProviderLogo');
    expect(providersView).toContain('<IconKey');
    expect(integrationSettings).toContain('gatewayIntegrationTypes');
    expect(integrationSettings).not.toContain('Object.entries(integrationLabels).map');
  });

  it('forbids inline object literals on <Navigate> state/to props and keeps PageSkeletons labels sr-only', () => {
    const navigateViolations: string[] = [];
    for (const file of tsxFiles) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/<Navigate\b[\s\S]*?\/>/g)) {
        if (/\b(?:state|to)=\{\{/.test(match[0])) {
          const line = source.slice(0, match.index ?? 0).split('\n').length;
          navigateViolations.push(`${relative(appDir, file)}:${line}`);
        }
      }
    }
    expect(navigateViolations).toEqual([]);

    const pageSkeletons = readFileSync(join(appDir, 'components/PageSkeletons.tsx'), 'utf8');
    expect(pageSkeletons).not.toContain('text-sm text-muted-foreground">{label}');
    expect(pageSkeletons).toContain('<span className="sr-only">{label}</span>');
  });

  it('keeps top navigation bars completely transparent when unscrolled and frosted glass when scrolled', () => {
    const publicHeaderCss = readFileSync(resolve(process.cwd(), '../../branding/public-header.css'), 'utf8');
    const docsStylesCss = readFileSync(resolve(process.cwd(), '../docs/src/styles.css'), 'utf8');
    const modelsCss = readFileSync(join(appDir, 'features/models/models.css'), 'utf8');
    const foundationCss = readFileSync(resolve(process.cwd(), 'app/styles/foundation.css'), 'utf8');
    const shellHeader = readFileSync(join(appDir, 'shell/ShellHeader.tsx'), 'utf8');
    const publicModelsPage = readFileSync(join(appDir, 'features/models/public-page.tsx'), 'utf8');

    expect(publicHeaderCss).toContain('background:transparent; border-bottom:1px solid transparent; box-shadow:none; -webkit-backdrop-filter:none; backdrop-filter:none;');
    expect(publicHeaderCss).toContain(":is(html.is-scrolled, :root[data-scrolled='true']) .public-header");
    expect(publicHeaderCss).toContain('backdrop-filter:saturate(180%) blur(20px)');

    expect(docsStylesCss).toContain('html.is-scrolled header.header');
    expect(docsStylesCss).toContain('backdrop-filter: saturate(180%) blur(20px)');

    expect(modelsCss).toContain('.public-models-topbar { position: sticky;');
    expect(modelsCss).toContain('background: transparent; border-bottom: 1px solid transparent;');
    expect(modelsCss).toContain('.public-models-topbar[data-scrolled="true"]');
    expect(publicModelsPage).toContain('data-scrolled={scrolled ? \'true\' : undefined}');

    expect(foundationCss).toContain('.dashboard-page-header { background: transparent; -webkit-backdrop-filter: none; backdrop-filter: none; }');
    expect(foundationCss).toContain('.dashboard-page-header[data-scrolled="true"]');
    expect(foundationCss).not.toContain('color-mix(in srgb, var(--background) 94%, transparent)');
    expect(shellHeader).toContain('data-scrolled={scrolled ? \'true\' : undefined}');
  });

  it('enforces a single unified credit-governed workflow with aria-pressed credit modes and zero operating_mode UI splits', () => {
    for (const rel of [
      'shell/admin-navigation.ts',
      'shell/ShellNavigation.tsx',
      'shell/ShellSectionTabs.tsx',
      'features/platform-settings/page.tsx',
      'features/account/settings-navigation.tsx',
      'features/account/settings-shell.tsx',
      'features/billing/page.tsx',
      'features/providers/ProviderList.tsx',
      'features/providers/components/ProviderConnectDialog.tsx',
    ]) {
      const source = readFileSync(join(appDir, rel), 'utf8');
      expect(source, `${rel} must not split UI on operating_mode === 'internal'`).not.toContain("operating_mode === 'internal'");
      expect(source, `${rel} must not split UI on operating_mode !== 'internal'`).not.toContain("operating_mode !== 'internal'");
    }

    const creditEditor = readFileSync(join(appDir, 'features/customers/customer-shared.tsx'), 'utf8');
    expect(creditEditor).toContain("aria-pressed={creditMode === 'prepaid'}");
    expect(creditEditor).toContain("aria-pressed={creditMode === 'fixed'}");
    expect(creditEditor).toContain("aria-pressed={creditMode === 'unlimited'}");
    expect(creditEditor).toContain('unlimited_credit: unlimitedCredit');

    const accountBilling = readFileSync(join(appDir, 'features/billing/AccountBilling.tsx'), 'utf8');
    expect(accountBilling).toContain('!unlimited && BigInt(account.available_nanos) <= 0n');

    const discountDialog = readFileSync(join(appDir, 'features/provider-business/ModelDiscountDialog.tsx'), 'utf8');
    expect(discountDialog).toContain('aria-pressed={discountPercent === preset}');

    const pricingHealth = readFileSync(join(appDir, 'features/retail-pricing/pricing-health.tsx'), 'utf8');
    expect(pricingHealth).toContain("supply === 'inactive' || supply === 'unconfigured'");
    expect(pricingHealth).toContain('money(rate.purchase, currency)');
    expect(pricingHealth).toContain('money(rate.selling, currency)');
  });

  it('places customer Account type at the top of CreateCompany and keeps organizationName separate from personName', () => {
    const createCompany = readFileSync(join(appDir, 'features/customers/create-company.tsx'), 'utf8');
    const formStart = createCompany.indexOf('<form onSubmit={submit}');
    const accountTypePos = createCompany.indexOf("aria-pressed={mode === 'personal'}", formStart);
    const firstInputPos = createCompany.indexOf('<Input', formStart);
    expect(formStart).toBeGreaterThan(-1);
    expect(accountTypePos).toBeGreaterThan(formStart);
    expect(accountTypePos).toBeLessThan(firstInputPos);
    expect(createCompany).toContain('const [organizationName, setOrganizationName]');
    expect(createCompany).toContain('const [personName, setPersonName]');
    expect(createCompany).not.toContain('Organization (optional)');
    expect(createCompany).not.toContain('归属组织（可选）');

    const customerPricingDialogs = readFileSync(join(appDir, 'features/customers/customer-pricing-dialogs.tsx'), 'utf8');
    expect(customerPricingDialogs).toContain('aria-pressed={discountInput.trim() === String(preset)}');
    expect(customerPricingDialogs).not.toContain("variant={discountInput.trim() === String(preset) ? 'default' : 'outline'}");
  });
});

it('keeps model mapping actions outside the scrollable advanced settings', () => {
  const form = readFileSync(resolve(process.cwd(), 'app/features/providers/components/ModelMappingForm.tsx'), 'utf8');
  expect(form).not.toContain('model-form-heading');
  expect(form).toMatch(/<details[\s\S]+<\/details>\s*<\/div>\s*<DialogFooter/);
  expect(form).toContain('showVideoSettings &&');
});

it('preserves visited panel state without mounting unvisited panels', () => {
  const view = (selected: string) => <Tabs value={selected}>
    <TabsContent value="first"><input aria-label="First draft" /></TabsContent>
    <TabsContent value="second"><input aria-label="Second draft" /></TabsContent>
  </Tabs>;
  const page = render(view('first'));
  expect(page.queryByLabelText('Second draft')).toBeNull();
  const draft = page.getByLabelText('First draft') as HTMLInputElement;
  draft.value = 'unfinished';
  page.rerender(view('second'));
  expect(page.getByRole('tabpanel').contains(draft)).toBe(false);
  page.rerender(view('first'));
  expect(page.getByLabelText('First draft')).toBe(draft);
  expect(draft.value).toBe('unfinished');
});

it('keeps tbody row headers on cell metrics and fills 404 empty states', () => {
  const appDir = resolve(process.cwd(), 'app');
  const table = readFileSync(join(appDir, 'components/ui/table.tsx'), 'utf8');
  expect(table).toContain('[&[scope=row]]:h-auto');
  expect(table).toContain('[&[scope=row]]:py-3.5');
  const surfaces = readFileSync(join(appDir, 'styles/surfaces.css'), 'utf8');
  expect(surfaces).toMatch(/\.not-found-empty \{[^}]*flex: 1 1 auto;[^}]*justify-content: center/);
});
