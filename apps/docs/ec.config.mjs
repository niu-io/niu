import { defineEcConfig } from '@astrojs/starlight/expressive-code';

const languageNames = {
  sh: 'Shell', bash: 'Shell', shell: 'Shell', shellscript: 'Shell',
  ts: 'TypeScript', typescript: 'TypeScript', js: 'JavaScript', javascript: 'JavaScript',
  json: 'JSON', jsonc: 'JSONC', py: 'Python', python: 'Python',
  yaml: 'YAML', yml: 'YAML', rust: 'Rust', sql: 'SQL', toml: 'TOML',
  http: 'HTTP', css: 'CSS', html: 'HTML', text: 'Plain text', plaintext: 'Plain text',
};

export default defineEcConfig({
  themes: ['github-dark', 'github-light'],
  useDarkModeMediaQuery: false,
  themeCssSelector: (theme) => `[data-theme="${theme.type}"]`,
  styleOverrides: {
    borderRadius: 'var(--radius-control)',
    borderColor: 'var(--border)',
    codeBackground: 'var(--card)',
    codeFontSize: '0.875rem',
    codeLineHeight: '1.7',
    codePaddingBlock: '1rem',
    codePaddingInline: '1.125rem',
    frames: {
      frameBoxShadowCssValue: 'none',
      editorTabBarBackground: 'var(--muted)',
      editorActiveTabBackground: 'transparent',
      editorActiveTabForeground: 'var(--muted-foreground)',
      editorActiveTabIndicatorTopColor: 'transparent',
      editorActiveTabIndicatorBottomColor: 'transparent',
    },
  },
  plugins: [{
    name: 'niu-code-language-label',
    hooks: {
      preprocessCode: ({ codeBlock }) => {
        // Keep explicit filenames/titles and opt-out frames supplied by authors.
        if (!codeBlock.props.title && (!codeBlock.props.frame || codeBlock.props.frame === 'auto')) {
          codeBlock.props.title = languageNames[codeBlock.language] || codeBlock.language || 'Plain text';
          codeBlock.props.frame = 'code';
        }
      },
    },
  }],
});
