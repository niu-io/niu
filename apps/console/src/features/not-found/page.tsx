import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';

export default function NotFoundRoute() {
  return <>
    <PageHeader title="Page not found" subtitle="This console route does not exist." />
    <section className="panel empty-state">
      <strong>We couldn’t find that page.</strong>
      <span>Use the workspace navigation to choose a supported view.</span>
      <Button asChild variant="outline"><Link to="..">Return to overview</Link></Button>
    </section>
  </>;
}
