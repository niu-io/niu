import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';

export default function NotFoundRoute() {
  return <>
    <PageHeader title="Page not found" />
    <section className="panel empty-state">
      <h2>We couldn’t find this page</h2>
      <span>This link may be outdated.</span>
      <Button asChild variant="outline"><Link to="..">Return to overview</Link></Button>
    </section>
  </>;
}
