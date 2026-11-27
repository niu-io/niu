import { Link } from 'react-router';
import { IconAdjustmentsHorizontal } from '@tabler/icons-react';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { RegistrationRequestsQueue } from '@/features/platform-settings/registration-review';
import { useDashboardContext } from '@/shell/dashboard-context';
import { useLocale } from '@/shell/ui-locale';

export default function AdminRegistrationsPage() {
  const { token, reloadWorkspaces } = useDashboardContext();
  const { t } = useLocale();

  return (
    <section className="empty-region min-w-0 space-y-5" aria-label={t('Registrations', '注册审批')}>
      <PageHeader
        title={t('Registrations', '注册审批')}
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/settings/registration">
              <IconAdjustmentsHorizontal size={16} aria-hidden="true" />
              <span>{t('Registration policy', '注册策略')}</span>
            </Link>
          </Button>
        }
      />
      <RegistrationRequestsQueue
        token={token}
        showPolicySection={false}
        onApproved={reloadWorkspaces}
      />
    </section>
  );
}
