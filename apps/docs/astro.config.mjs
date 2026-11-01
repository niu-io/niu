import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { satteri } from '@astrojs/markdown-satteri';
import scrollableTables from './scripts/scrollable-tables.mjs';

export default defineConfig({
  site: 'https://niu.io',
  base: '/docs',
  markdown: { processor: satteri({ hastPlugins: [scrollableTables()] }) },
  vite: { plugins: [tailwindcss()], resolve: { alias: { '@': fileURLToPath(new URL('../dashboard/app', import.meta.url)) } } },
  integrations: [
    react(),
    starlight({
      title: 'Niu',
      description: 'The Model Platform for Agents. Connect your agent, delegate model management and review the evidence.',
      logo: {
        src: '../../branding/assets/niu-mark.png',
        alt: '',
      },
      favicon: '/favicon.ico',
      head: [{ tag: 'meta', attrs: { property: 'og:image', content: 'https://niu.io/docs/niu-social-en-dark.png' } }],
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/niu-io/niu',
        },
      ],
      customCss: ['./src/styles.css'],
      components: { PageTitle: './src/components/PageTitle.astro', MobileMenuToggle: './src/components/MobileMenuToggle.astro', Header: './src/components/Header.astro', Sidebar: './src/components/Sidebar.astro', ThemeSelect: './src/components/ThemeSelect.astro', ThemeProvider: './src/components/ThemeProvider.astro', PageFrame: './src/components/PageFrame.astro', SiteTitle: './src/components/SiteTitle.astro' },
      sidebar: [
        { label: 'Start here', items: [
          { label: 'Overview', slug: 'index' },
          { label: 'Build with Niu', slug: 'guides/personal-assistant' },
        ] },
        { label: 'For coding agents', collapsed: false, items: [
          { label: 'Agent documentation', slug: 'agents' },
          // Starlight prefixes its /docs base onto local sidebar links.
          { label: 'Install and configure', link: '/install.md' },
          { label: 'Capability map', link: '/agents.md' },
          { label: 'Model pools', link: '/pools.md' },
          { label: 'Evaluations', link: '/evaluations.md' },
          { label: 'Resource events', link: '/events.md' },
          { label: 'MCP reference', slug: 'guides/mcp' },
          { label: 'Manual API quickstart', slug: 'getting-started' },
          { label: 'API tutorial', slug: 'guides/api-quickstart' },
          { label: 'SDK tutorial', slug: 'guides/sdk-quickstart' },
        ] },
        { label: 'Product references', collapsed: true, items: [
          { label: 'Models & routing', slug: 'configuration/models' },
          { label: 'Generations', slug: 'reference/generations' },
          { label: 'Video generation', slug: 'reference/video' },
          { label: 'Request logs', slug: 'concepts/execution-observation' },
          { label: 'Request capacity', slug: 'guides/request-capacity' },
          'configuration/guardrails',
          { label: 'Material library', slug: 'reference/workspace-materials' },
          { label: 'Usage & billing', slug: 'concepts/performance-and-cost' },
          { label: 'Request lifecycle', slug: 'concepts/request-lifecycle' },
        ] },
        { label: 'Administration', collapsed: true, items: [
          { label: 'Overview', slug: 'admin' },
          { label: 'Access & roles', slug: 'admin/access' },
          { label: 'Customer setup', slug: 'admin/customers' },
          { label: 'Providers', slug: 'admin/suppliers' },
          { label: 'Customer pricing', slug: 'admin/pricing' },
          { label: 'Payments', slug: 'admin/payments' },
          { label: 'Branding & theme', slug: 'admin/branding' },
          { label: 'Audit logs', slug: 'reference/platform-audit' },
        ] },
        { label: 'Operate Niu', collapsed: true, items: [
          { label: 'Deployment', slug: 'deployment/single-container' },
          { label: 'Release qualification', slug: 'releases/first-release' },
          { label: 'Security & access', slug: 'security/overview' },
          { label: 'Performance benchmark', slug: 'guides/gateway-benchmarks' },
          { label: 'Load testing', slug: 'guides/gateway-load-testing' },
          { label: 'Local development', slug: 'guides/local-development' },
        ] },
        { label: 'API', collapsed: true, items: [
          { label: 'REST specification', slug: 'api/rest' },
          { label: 'Model discovery', slug: 'api/rest/listmodels' },
          { label: 'Chat completions', slug: 'api/rest/createchatcompletion' },
        ] },
        { label: 'SDK', collapsed: true, items: [
          { label: 'Interfaces & types', slug: 'api/sdk' },
          { label: 'NiuClient', slug: 'api/sdk/niuclient' },
          { label: 'NiuAdminClient', slug: 'api/sdk/niuadminclient' },
          { label: 'NiuAPIError', slug: 'api/sdk/niuapierror' },
        ] },
        { label: 'Compare', collapsed: true, items: [
          { label: 'Overview', slug: 'compare' },
          { label: 'Niu vs New API', slug: 'compare/new-api' },
          { label: 'Niu vs OpenRouter', slug: 'compare/openrouter' },
        ] },
      ],
    }),
  ],
});
