import type { ReactNode } from 'react';

export default function PageHeader({ title, eyebrow, action, className }: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  className?: string;
}) {
  return <div className={`page-heading${className ? ` ${className}` : ''}`}>
    <div className="page-heading-copy">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1></div>
    {action && <div className="page-heading-action">{action}</div>}
  </div>;
}
