import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { mathDelimiters } from '../../../src/features/playground/math-delimiters';

describe('Chat Markdown', () => {
  it('renders inline and display LaTeX with KaTeX', () => {
    const markdown = String.raw`Inline \(x^2\) and $y^2$.

\[
\frac{128000}{8000} = 16
\]`;
    const { container } = render(<ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{mathDelimiters(markdown)}</ReactMarkdown>);
    expect(container.querySelectorAll('.katex')).toHaveLength(3);
    expect(container.querySelectorAll('.katex-display')).toHaveLength(1);
  });
  it('preserves code examples and unfinished code fences', () => {
    for (const code of ['`\\(x\\)`', '```tex\n\\[x\\]\n```', '~~~tex\n\\[x\\]\n~~~', '```tex\n\\[x\\]']) {
      expect(mathDelimiters(code)).toBe(code);
    }
  });
});
