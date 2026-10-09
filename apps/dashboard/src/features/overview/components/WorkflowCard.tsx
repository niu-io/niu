import type { TablerIcon } from "@tabler/icons-react";
import { IconArrowRight as ArrowRight } from "@tabler/icons-react";
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function WorkflowCard({ icon: Icon, title, detail, action, to }: {
  icon: TablerIcon;
  title: string;
  detail: string;
  action: string;
  to: string;
}) {
  return <Card className="overview-workflow panel" role="group" aria-label={title}>
    <div className="overview-workflow-icon"><Icon size={17} aria-hidden="true" /></div>
    <h2>{title}</h2>
    <p>{detail}</p>
    <Button asChild variant="ghost" size="sm"><Link to={to}>{action}<ArrowRight size={14} /></Link></Button>
  </Card>;
}
