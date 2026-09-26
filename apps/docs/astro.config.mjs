import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://niu.io',
  base: '/docs',
  integrations: [
    starlight({
      title: 'Niu Documentation',
      description: 'Build and operate the Niu AI gateway.',
      logo: {
        light: './src/assets/niu-logo-dark.png',
        dark: './src/assets/niu-logo-dark.png',
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
      sidebar: [
        { label: 'Start here', items: ['index', 'getting-started'] },
        {
          label: 'Operate Niu',
          items: ['deployment/single-container', 'configuration/models', 'security/overview'],
        },
        {
          label: 'Concepts',
          items: ['concepts/performance-and-cost', 'concepts/request-lifecycle', 'concepts/execution-observation', 'concepts/subscription-observation'],
        },
        { label: 'Reference', items: ['reference/api'] },
      ],
    }),
  ],
});
