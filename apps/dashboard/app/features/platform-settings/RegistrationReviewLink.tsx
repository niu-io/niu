import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { PlatformRegistrationQueuePage } from '@niu-io/sdk';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { request } from '@/lib/api-client';
import { useDashboardContext } from '@/shell/dashboard-context';
import { useLocale } from '@/shell/ui-locale';

export default function RegistrationReviewLink() {
  const { token } = useDashboardContext();
  const { t } = useLocale();
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    void request<PlatformRegistrationQueuePage>(
      token,
      '/api/v1/admin/registrations?status=pending&limit=1',
      'GET',
      undefined,
      controller.signal,
    )
      .then(page => {
        if (!controller.signal.aborted) setPendingCount(page.counts.pending);
      })
      .catch(() => {
        // Leave pending badge absent if the count could not be read.
      });
    return () => controller.abort();
  }, [token]);

  return (
    <Button asChild variant="outline" size="sm">
      <Link to="/admin/customers?tab=registrations">
        {t('Review requests', '注册审批')}
        {pendingCount !== null && pendingCount > 0 && <Badge>{pendingCount}</Badge>}
      </Link>
    </Button>
  );
}
