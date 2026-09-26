import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

export default function WorkflowCard({ icon: Icon, title, detail, action, to }: {
  icon: LucideIcon;
  title: string;
  detail: string;
  action: string;
  to: string;
}) {
  return <section className="overview-workflow panel">
    <div className="overview-workflow-icon"><Icon size={17} aria-hidden="true" /></div>
    <h2>{title}</h2>
    <p>{detail}</p>
    <Button asChild variant="ghost" size="sm"><Link to={to}>{action}<ArrowRight size={14} /></Link></Button>
  </section>;
}
