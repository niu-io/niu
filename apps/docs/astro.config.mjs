import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  site: 'https://niu.io',
  base: '/docs',
  vite: { plugins: [tailwindcss()], resolve: { alias: { '@': fileURLToPath(new URL('../dashboard/src', import.meta.url)) } } },
  integrations: [
    react(),
    starlight({
      title: 'Niu',
      description: 'Build and operate the Niu AI gateway.',
      logo: {
        src: '../../branding/assets/niu-mark.png',
        alt: '',
      },
      favicon: '/favicon.ico',
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
          { label: 'Quickstart', slug: 'getting-started' },
          { label: 'API tutorial', slug: 'guides/api-quickstart' },
          { label: 'SDK tutorial', slug: 'guides/sdk-quickstart' },
        ] },
        { label: 'Use Niu', items: [
          { label: 'Models & routing', slug: 'configuration/models' },
          { label: 'Generations', slug: 'reference/generations' },
          { label: 'Video generation', slug: 'reference/video' },
          { label: 'Request logs', slug: 'concepts/execution-observation' },
          'configuration/guardrails',
        ] },
        { label: 'Operate Niu', items: [
          { label: 'Deployment', slug: 'deployment/single-container' },
          { label: 'Security & access', slug: 'security/overview' },
          { label: 'Audit logs', slug: 'reference/platform-audit' },
          { label: 'Local development', slug: 'guides/local-development' },
        ] },
        { label: 'API', items: [
          { label: 'REST specification', slug: 'api/rest' },
          { label: 'Model discovery', slug: 'api/rest/listmodels' },
          { label: 'Chat completions', slug: 'api/rest/createchatcompletion' },
        ] },
        { label: 'SDK', items: [
          { label: 'Interfaces & types', slug: 'api/sdk' },
          { label: 'NiuClient', slug: 'api/sdk/niuclient' },
          { label: 'NiuAdminClient', slug: 'api/sdk/niuadminclient' },
          { label: 'NiuAPIError', slug: 'api/sdk/niuapierror' },
        ] },
        { label: 'Advanced', collapsed: true, items: [
          'concepts/request-lifecycle', 'concepts/performance-and-cost',
          { label: 'Integration notes', slug: 'reference/api' },
          'reference/backend-business', 'reference/backend-text-load', 'reference/workspace-materials',
          'reference/handler-operations',
          { label: 'Load testing', slug: 'guides/gateway-load-testing' },
          { label: 'Legacy quota records', slug: 'concepts/subscription-observation' },
          { label: 'Offline evaluator', slug: 'concepts/benchmarking' },
        ] },
        { label: 'Compare', items: [
          { label: 'Overview', slug: 'compare' },
          { label: 'Niu vs New API', slug: 'compare/new-api' },
          { label: 'Niu vs OpenRouter', slug: 'compare/openrouter' },
        ] },
      ],
    }),
  ],
});
