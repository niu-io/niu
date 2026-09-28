import type { ReactNode } from 'react';

export default function PageHeader({ subtitle, eyebrow, action, className }: {
  subtitle: string;
  eyebrow?: string;
  action?: ReactNode;
  className?: string;
}) {
  return <div className={`page-heading${className ? ` ${className}` : ''}`}>
    <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<p className="page-subtitle">{subtitle}</p></div>
    {action && <div className="page-heading-action">{action}</div>}
  </div>;
}
