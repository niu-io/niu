import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';

export default function NotFoundRoute() {
  return <>
    <PageHeader title="Page not found" />
    <Empty className="not-found-empty">
      <EmptyHeader><EmptyTitle role="heading" aria-level={2}>We couldn’t find this page</EmptyTitle><EmptyDescription>This link may be outdated.</EmptyDescription></EmptyHeader>
      <EmptyContent><Button asChild variant="outline"><Link to="..">Return to overview</Link></Button></EmptyContent>
    </Empty>
  </>;
}
