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
      title: 'niu.io',
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
      components: { ThemeSelect: './src/components/ThemeSelect.astro', ThemeProvider: './src/components/ThemeProvider.astro', PageFrame: './src/components/PageFrame.astro', SiteTitle: './src/components/SiteTitle.astro' },
      sidebar: [
        { label: 'Getting started', items: ['index', 'getting-started'] },
        { label: 'Models & routing', items: ['configuration/models'] },
        { label: 'Guardrails', items: ['configuration/guardrails'] },
        { label: 'Workspace logs', items: [
          { label: 'Request logs', slug: 'concepts/execution-observation' },
        ] },
        { label: 'Administration', items: [
          { label: 'Deployment', slug: 'deployment/single-container' },
          { label: 'Local development', slug: 'guides/local-development' },
          { label: 'Security', slug: 'security/overview' },
          { label: 'Load testing', slug: 'guides/gateway-load-testing' },
        ] },
        { label: 'Concepts', items: ['concepts/request-lifecycle', 'concepts/performance-and-cost'] },
        { label: 'Reference', items: [
          'reference/api',
          'reference/handler-operations',
          { label: 'Legacy quota records', slug: 'concepts/subscription-observation' },
          { label: 'Offline evaluator', slug: 'concepts/benchmarking' },
        ] },
      ],
    }),
  ],
});
