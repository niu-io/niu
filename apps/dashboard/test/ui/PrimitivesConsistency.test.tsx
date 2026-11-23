import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { Label } from '@/components/ui/label';

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
});
