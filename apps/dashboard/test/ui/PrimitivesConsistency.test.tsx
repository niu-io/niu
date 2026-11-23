import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import PageHeader, { PageHeaderTabsTargetContext } from '@/components/PageHeader';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
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

  it('keeps Empty placeholders card-free and transparent by default', () => {
    const { container } = render(
      <Empty>
        <EmptyHeader>
          <EmptyMedia />
          <EmptyDescription>No items yet</EmptyDescription>
        </EmptyHeader>
      </Empty>,
    );
    const root = container.querySelector('[data-slot="empty"]') as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.className).not.toContain('bg-card');
    expect(root.className).not.toContain('radius-panel');
    expect(root.className).toContain('w-full');
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

  it('keeps the Models catalog as a responsive multi-column card grid instead of a single-column stack', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/features/models/models.css'), 'utf8');
    const block = css.match(/\.models-cards\s*\{[^}]*\}/)?.[0] ?? '';
    expect(block).toContain('display: grid');
    expect(block).toMatch(/grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(/);
    expect(block).not.toContain('flex-direction: column');
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

  it('locks key-table column geometry with table-layout: fixed so secret reveal never shifts columns', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/styles/operations.css'), 'utf8');
    expect(css).toMatch(/\.key-table\s*\{[^}]*table-layout:\s*fixed/);
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
      'features/customers/page.tsx',
      'features/platform-settings/page.tsx',
      'features/incidents/page.tsx',
      'features/platform/page.tsx',
      'features/retail-pricing/page.tsx',
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
    const customerShared = readFileSync(join(appDir, 'features/customers/customer-shared.tsx'), 'utf8');
    expect(customerShared).toContain('aria-pressed={!trimmedTrial}');
    expect(customerShared).toContain('aria-pressed={trimmedTrial === preset}');
    expect(customerShared).not.toContain("variant={!trialAmount.trim() ? 'secondary' : 'outline'}");
  });

  it('reserves Not published (未发布) for uncallable commercial models and never stamps Capabilities not published (能力未发布) on callable model cards', () => {
    const modelTable = readFileSync(join(appDir, 'features/models/components/ModelTable.tsx'), 'utf8');
    expect(modelTable).not.toContain('Capabilities not published');
    expect(modelTable).not.toContain('capabilities have not been published');
    expect(modelTable).toContain('uiT("Not published")');
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
