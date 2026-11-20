import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/PageHeader';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { IconCompass } from '@tabler/icons-react';
import type { RouteHandle } from '@/shell/router-context';
import { useDashboardContext } from '@/shell/dashboard-context';
import { workspacePathSegment } from '@/shell/workspace-route';
import { useLocale } from '@/shell/ui-locale';

export const handle: RouteHandle = {
  destination: 'Workspace',
  title: { en: 'Page not found', zh: '页面未找到' },
};

export default function NotFoundRoute() {
  const { t } = useLocale();
  const context = useDashboardContext();
  const overviewHref = context?.workspace
    ? `/workspaces/${workspacePathSegment(context.workspace, context.workspaces)}`
    : '/workspaces/default';
  return <>
    <PageHeader title={t('Page not found', '页面未找到')} />
    <Empty className="not-found-empty">
      <EmptyHeader><EmptyMedia variant="icon"><IconCompass size={20} aria-hidden="true" /></EmptyMedia><EmptyTitle role="heading" aria-level={2}>{t('We couldn’t find this page', '未找到此页面')}</EmptyTitle><EmptyDescription>{t('This link may be outdated.', '此链接可能已过期。')}</EmptyDescription></EmptyHeader>
      <EmptyContent><Button asChild variant="outline"><Link to={overviewHref}>{t('Return to overview', '返回概览')}</Link></Button></EmptyContent>
    </Empty>
  </>;
}
