import type { ReactNode } from 'react';

export default function PageHeader({ action, className }: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  className?: string;
}) {
  if (!action) return null;
  return <div className={`page-heading page-actions${className ? ` ${className}` : ''}`}>
    <div className="page-heading-action">{action}</div>
  </div>;
}
