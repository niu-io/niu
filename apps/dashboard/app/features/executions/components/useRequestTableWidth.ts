import { useEffect, useState } from 'react';

export function useRequestTableWidth() {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (!node) return;
    const update = () => setNarrow(node.clientWidth <= 860);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return { setNode, narrow };
}
