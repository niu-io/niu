import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { PlatformRegistrationQueuePage } from '@niu-io/sdk';
import { IconArrowRight } from '@tabler/icons-react';
import PageHeader from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { request } from '@/lib/api-client';
import { useDashboardContext } from '@/shell/dashboard-context';
import { useLocale } from '@/shell/ui-locale';
import { RegistrationPolicySection } from './registration-review';

export default function PlatformRegistrationPolicyPage() {
  const { token, session } = useDashboardContext();
  const { t } = useLocale();
  const isInternal = session?.operating_mode === 'internal';
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    if (!token || isInternal) return;
    const controller = new AbortController();
    void request<PlatformRegistrationQueuePage>(
      token,
      '/api/v1/platform/registrations?status=pending&limit=1',
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
  }, [token, isInternal]);

  return (
    <section className="w-full min-w-0 space-y-6" aria-label={t('Registration policy', '注册策略')}>
      <PageHeader
        title={t('Registration policy', '注册策略')}
        action={
          !isInternal ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/registrations">
                <span>{t('Review requests', '前往注册审批')}</span>
                {pendingCount !== null && pendingCount > 0 && <Badge variant="default">{pendingCount}</Badge>}
                <IconArrowRight size={15} aria-hidden="true" />
              </Link>
            </Button>
          ) : undefined
        }
      />
      <RegistrationPolicySection token={token} />
    </section>
  );
}
