import { useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export default function PageHeader({ action, className }: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  className?: string;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setTarget(document.getElementById('dashboard-page-actions')); }, []);
  if (!action) return null;
  const actions = <div className={`page-heading-action${className ? ` ${className}` : ''}`}>{action}</div>;
  return target ? createPortal(actions, target) : <div className="page-heading page-actions">{actions}</div>;
}
