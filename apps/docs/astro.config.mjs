import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { satteri } from '@astrojs/markdown-satteri';
import scrollableTables from './scripts/scrollable-tables.mjs';

const publicOrigin = (process.env.NIU_PUBLIC_ORIGIN?.trim() || 'https://niu.io').replace(/\/+$/, '');

export default defineConfig({
  site: publicOrigin,
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
      favicon: '/niu-mark-32.png',
      head: [
        { tag: 'meta', attrs: { property: 'og:image', content: `${publicOrigin}/docs/niu-social-en-dark.png` } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', sizes: '180x180', href: '/docs/apple-touch-icon.png' } },
      ],
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/niu-io/niu',
        },
      ],
      customCss: ['./src/styles.css'],
      components: { MarkdownContent: './src/components/MarkdownContent.astro', PageTitle: './src/components/PageTitle.astro', MobileMenuToggle: './src/components/MobileMenuToggle.astro', Header: './src/components/Header.astro', Sidebar: './src/components/Sidebar.astro', ThemeSelect: './src/components/ThemeSelect.astro', ThemeProvider: './src/components/ThemeProvider.astro', PageFrame: './src/components/PageFrame.astro', SiteTitle: './src/components/SiteTitle.astro' },
      sidebar: [
        { label: 'Start here', collapsed: false, items: [
          { label: 'Overview', slug: 'index' },
          { label: 'Quickstart', slug: 'getting-started' },
        ] },
        { label: 'Agent contracts', collapsed: false, items: [
          { label: 'Install & connect', slug: 'agents/install' },
          { label: 'Capabilities & grants', slug: 'agents/capabilities' },
          { label: 'Model inference', slug: 'agents/inference' },
          { label: 'Workspace routing', slug: 'agents/pools' },
          { label: 'Evaluations', slug: 'agents/evaluations' },
          { label: 'Resource events', slug: 'agents/events' },
          { label: 'MCP server', slug: 'guides/mcp' },
        ] },
        { label: 'Platform & deployment', collapsed: false, items: [
          { label: 'Single-container deployment', slug: 'deployment/single-container' },
          { label: 'Security & access', slug: 'security/overview' },
        ] },
        { label: 'API', collapsed: true, items: [
          { label: 'REST specification', slug: 'api/rest' },
          { label: 'API explorer', slug: 'api/explorer' },
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
