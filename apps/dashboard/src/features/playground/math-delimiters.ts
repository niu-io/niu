/** Accept model-generated LaTeX delimiters without changing literal code. */
export function mathDelimiters(markdown: string): string {
  // Keep fenced and inline code opaque, including unfinished fences while streaming.
  return markdown.replace(/(^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\2[^\n]*(?:\n|$)|(?![\s\S])))|(`+)[^`]*?\3|\\\[([\s\S]*?)\\\]|\\\(([^\n]*?)\\\)/gm,
    (match, fence, _marker, inline, display, math) => {
      if (fence || inline) return match;
      return display !== undefined ? `\n$$\n${display.trim()}\n$$\n` : `$${math}$`;
    });
}
