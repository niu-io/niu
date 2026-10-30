// Preserve native table column sizing while containing wide reference tables.
export default function scrollableTables() {
  return {
    name: 'niu-scrollable-tables',
    element: {
      filter: ['table'],
      visit(node, ctx) {
        if (node.properties?.className?.includes('comparison-table')) return;
        ctx.wrapNode(node, {
          type: 'element',
          tagName: 'div',
          properties: { className: ['docs-markdown-table'], tabIndex: 0 },
          children: [],
        });
      },
    },
  };
}
