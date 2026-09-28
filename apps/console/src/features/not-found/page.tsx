import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';

export default function NotFoundRoute() {
  return <>
    <PageHeader title="Page not found" />
    <section className="panel empty-state">
      <span>This link may be outdated.</span>
      <Button asChild variant="outline"><Link to="..">Return to overview</Link></Button>
    </section>
  </>;
}
